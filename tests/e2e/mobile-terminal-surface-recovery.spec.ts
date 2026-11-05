import { randomUUID } from 'node:crypto'
import { runProcessSync } from '@orca/process-host'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { TestInfo } from '@stablyai/playwright-test'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { test, expect } from './helpers/orca-app'
import { createDesktopMobilePairingOffer } from './helpers/paired-electron-client'
import { pairMobileClient } from './helpers/paired-mobile-client'
import { getWorktreeTabs, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  discoverActivePtyId,
  getTerminalContent,
  readPaneIdentitySnapshot
} from './helpers/terminal'
import { worktreeRowSurface } from './worktree-row-locators'
import { createRestartSession } from './helpers/orca-restart'
import {
  launchManagedWorkspace,
  relaunchManagedApp,
  type ManagedHostFixture
} from './helpers/orcad-managed-workspace'
import {
  callEnvironment,
  createPairedHostTerminal,
  openPairedClientTab,
  readPairedPaneContent
} from './helpers/paired-host-terminal'
import { toRuntimeExecutionHostId } from '../../src/shared/execution-host'
import type { PairedMobileSocket } from './helpers/paired-mobile-client'

const CreatedRepo = z.object({ repo: z.object({ id: z.string() }) })

async function recordTerminalIdentity(
  testInfo: TestInfo,
  name: string,
  facts: unknown
): Promise<void> {
  const file = testInfo.outputPath(`${name}.json`)
  writeFileSync(file, `${JSON.stringify(facts, null, 2)}\n`)
  await testInfo.attach(name, { path: file, contentType: 'application/json' })
}
const TerminalIdentities = z.object({
  terminals: z.array(
    z.object({
      handle: z.string(),
      tabId: z.string(),
      leafId: z.string(),
      ptyId: z.string().nullable(),
      incarnationId: z.string().nullish()
    })
  )
})

const SshFixture = z.object({
  input: z.object({
    label: z.string(),
    host: z.string(),
    port: z.number(),
    username: z.string(),
    identityFile: z.string(),
    identitiesOnly: z.boolean(),
    relayGracePeriodSeconds: z.number()
  }),
  repoPath: z.string(),
  folderPath: z.string()
})

async function callPhoneHost(
  socket: PairedMobileSocket,
  executionHost: string,
  method: string,
  params: unknown
): Promise<void> {
  const id = randomUUID()
  socket.send(id, method, params, executionHost)
  let frame: PairedMobileSocket['frames'][number] | undefined
  await expect
    .poll(
      () => {
        frame = socket.frames.find((value) => value.id === id)
        return frame !== undefined
      },
      { timeout: 60_000 }
    )
    .toBe(true)
  expect(frame?.ok, `${method}: ${JSON.stringify(frame?.error)}`).toBe(true)
}

for (const [kind, census] of [
  ['git', 'unavailable'],
  ['folder', 'unavailable'],
  ['git', 'legacy'],
  ['folder', 'legacy']
] as const) {
  test(`phone activation preserves a live ${kind} terminal while its surface census is ${census}`, async ({
    orcaPage,
    electronApp,
    testRepoPath
  }, testInfo) => {
    // Fresh profiles must finish pairing and both activation passes.
    test.setTimeout(180_000)
    await waitForSessionReady(orcaPage)
    const initialWorktreeId = await waitForActiveWorktree(orcaPage)
    const parentPath = mkdtempSync(path.join(os.tmpdir(), 'orca-live-surface-'))
    const recoveryPath = path.join(parentPath, 'recovery')
    if (kind === 'git') {
      const cloned = runProcessSync({
        program: 'git',
        args: ['clone', '--no-hardlinks', testRepoPath, recoveryPath],
        timeoutMs: 30_000
      })
      if (cloned.code !== 0) {
        throw new Error(cloned.stderr || 'Could not clone the isolated recovery repository')
      }
    } else {
      mkdirSync(recoveryPath)
    }
    const phone = pairMobileClient(await createDesktopMobilePairingOffer(orcaPage))
    try {
      const created = await orcaPage.evaluate(
        async ({ recoveryPath, kind }) => {
          const response = await window.api.runtime.call({
            method: 'repo.add',
            params: { path: recoveryPath, kind }
          })
          if (!response.ok) {
            throw new Error(response.error.message)
          }
          if (
            response.result &&
            typeof response.result === 'object' &&
            'error' in response.result
          ) {
            throw new Error(String(response.result.error))
          }
          return response.result
        },
        { recoveryPath, kind }
      )
      const repoId = CreatedRepo.parse(created).repo.id
      const workspace = await orcaPage.evaluate(async (repoId) => {
        const store = window.__store!
        await store.getState().fetchReposForAllHosts()
        await store.getState().fetchWorktrees(repoId, { forceLocalOwner: true })
        const worktree = store.getState().worktreesByRepo[repoId]?.[0]
        if (!worktree) {
          throw new Error('Recovery workspace missing from catalog')
        }
        return { id: worktree.id, path: worktree.path }
      }, repoId)
      expect(await getWorktreeTabs(orcaPage, workspace.id)).toEqual([])
      const original = await orcaPage.evaluate(
        async ({ workspace, suffix }) => {
          return window.api.pty.spawn({
            cols: 100,
            rows: 30,
            cwd: workspace.path,
            worktreeId: workspace.id,
            sessionId: `${workspace.id}@@${suffix}`,
            initiallyHidden: true
          })
        },
        { workspace, suffix: randomUUID() }
      )
      expect(original.incarnationId).toBeTruthy()
      const before = await orcaPage.evaluate(async (id) => {
        return (await window.api.pty.listSessions()).find((session) => session.id === id)
      }, original.id)
      expect(before?.rootProcessId).toBeGreaterThan(0)
      const marker = `ORCA_RECOVERY_${randomUUID().replaceAll('-', '')}`
      await orcaPage.evaluate(
        ({ id, marker }) => window.api.pty.writeAccepted(id, `echo ${marker}\r`, 'driving'),
        {
          id: original.id,
          marker
        }
      )

      const censusProbe = await electronApp.evaluateHandle(({ ipcMain }, census) => {
        if (!('_invokeHandlers' in ipcMain) || !(ipcMain._invokeHandlers instanceof Map)) {
          throw new Error('Runtime IPC registry missing')
        }
        const handler = ipcMain._invokeHandlers.get('runtime:call')
        if (typeof handler !== 'function') {
          throw new Error('Runtime IPC handler missing')
        }
        const probe: { fault: 'unavailable' | 'legacy' | false } = { fault: census }
        ipcMain.removeHandler('runtime:call')
        ipcMain.handle('runtime:call', (event, request) => {
          const fault = probe.fault
          if (fault === 'unavailable' && request.method === 'terminal.list') {
            return {
              ok: false,
              error: { code: 'terminal_liveness_unavailable', message: 'Test census unavailable' }
            }
          }
          if (fault === 'legacy' && request.method === 'terminal.list') {
            return Promise.resolve(handler(event, request)).then((response) => {
              if (!response.ok) {
                return response
              }
              const result = { ...response.result }
              delete result.hostScope
              return { ...response, result }
            })
          }
          return handler(event, request)
        })
        return probe
      }, census)
      let declined = false
      orcaPage.on('console', (message) => {
        if (message.text().includes('live PTYs left without a surface')) {
          declined = true
        }
      })
      for (let activation = 0; activation < 3; activation += 1) {
        await phone.call('worktree.activate', { worktree: `id:${workspace.id}` })
      }
      await Promise.all(
        [0, 1, 2].map(() => phone.call('worktree.activate', { worktree: `id:${workspace.id}` }))
      )
      await worktreeRowSurface(orcaPage, workspace.id).click()
      await expect.poll(() => declined).toBe(true)
      await orcaPage.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      const unresolvedTabs = await getWorktreeTabs(orcaPage, workspace.id)
      expect(
        unresolvedTabs,
        'an unverifiable live surface must not seed a default terminal'
      ).toEqual([])

      await censusProbe.evaluate((probe) => {
        probe.fault = false
      })
      await worktreeRowSurface(orcaPage, initialWorktreeId).click()
      await worktreeRowSurface(orcaPage, workspace.id).click()
      await expect.poll(() => getTerminalContent(orcaPage), { timeout: 30_000 }).toContain(marker)
      const after = await orcaPage.evaluate(async (worktreeId) => {
        return (await window.api.pty.listSessions()).filter(
          (session) => session.worktreeId === worktreeId
        )
      }, workspace.id)
      expect(after).toHaveLength(1)
      expect(after[0]).toMatchObject({
        id: original.id,
        incarnationId: original.incarnationId,
        rootProcessId: before?.rootProcessId
      })
      expect(await getWorktreeTabs(orcaPage, workspace.id)).toHaveLength(1)
      await orcaPage.screenshot({ path: testInfo.outputPath('recovered-original-terminal.png') })
      await recordTerminalIdentity(testInfo, 'terminal-identity', {
        kind,
        census,
        before,
        after,
        tabs: await getWorktreeTabs(orcaPage, workspace.id)
      })
    } finally {
      phone.dispose()
      rmSync(parentPath, { recursive: true, force: true })
    }
  })
}

test('renderer restart retains a saved live terminal through an unanswered attach', async ({
  orcaPage,
  electronApp
}, testInfo) => {
  // Two renderer reloads include initial daemon setup.
  test.setTimeout(180_000)
  await waitForSessionReady(orcaPage)
  const worktreeId = await waitForActiveWorktree(orcaPage)
  const ptyId = await discoverActivePtyId(orcaPage)
  const originalPane = await readPaneIdentitySnapshot(orcaPage)
  if (!originalPane) {
    throw new Error('Original terminal pane missing')
  }
  const before = await orcaPage.evaluate(async (id) => {
    return (await window.api.pty.listSessions()).find((session) => session.id === id)
  }, ptyId)
  expect(before?.incarnationId).toBeTruthy()
  expect(before?.rootProcessId).toBeGreaterThan(0)
  const marker = `ORCA_RESTART_${randomUUID().replaceAll('-', '')}`
  await orcaPage.evaluate(
    ({ id, marker }) => window.api.pty.writeAccepted(id, `echo ${marker}\r`, 'driving'),
    { id: ptyId, marker }
  )
  await expect.poll(() => getTerminalContent(orcaPage)).toContain(marker)
  const reattachProbe = await electronApp.evaluateHandle(({ ipcMain }, ptyId) => {
    if (!('_invokeHandlers' in ipcMain) || !(ipcMain._invokeHandlers instanceof Map)) {
      throw new Error('PTY IPC registry missing')
    }
    const handler = ipcMain._invokeHandlers.get('pty:spawn')
    if (typeof handler !== 'function') {
      throw new Error('PTY IPC handler missing')
    }
    const calls: { sessionId?: string }[] = []
    const probe = { unavailable: true, calls }
    ipcMain.removeHandler('pty:spawn')
    ipcMain.handle('pty:spawn', (event, request) => {
      calls.push({ sessionId: request.sessionId })
      if (probe.unavailable && request.sessionId === ptyId) {
        throw new Error('Test attach reply unavailable')
      }
      return handler(event, request)
    })
    return probe
  }, ptyId)
  await orcaPage.reload()
  await waitForSessionReady(orcaPage)
  await expect.poll(() => reattachProbe.evaluate((probe) => probe.calls.length)).toBeGreaterThan(0)
  await reattachProbe.evaluate((probe) => {
    probe.unavailable = false
  })
  await orcaPage.reload()
  await waitForSessionReady(orcaPage)
  await expect.poll(() => getTerminalContent(orcaPage), { timeout: 30_000 }).toContain(marker)
  const after = await orcaPage.evaluate(async (worktreeId) => {
    return (await window.api.pty.listSessions()).filter(
      (session) => session.worktreeId === worktreeId
    )
  }, worktreeId)
  expect(after).toHaveLength(1)
  expect(after[0]).toMatchObject({
    id: ptyId,
    incarnationId: before?.incarnationId,
    rootProcessId: before?.rootProcessId
  })
  const recoveredPane = await readPaneIdentitySnapshot(orcaPage)
  if (!recoveredPane) {
    throw new Error('Recovered terminal pane missing')
  }
  expect(recoveredPane.tabId).toBe(originalPane.tabId)
  expect(recoveredPane.activeLeafId).toBe(originalPane.activeLeafId)
  expect(recoveredPane.ptyIdsByLeafId).toEqual(originalPane.ptyIdsByLeafId)
  const calls = await reattachProbe.evaluate((probe) => probe.calls)
  await recordTerminalIdentity(testInfo, 'restart-identity', {
    originalPane,
    recoveredPane,
    before,
    after,
    calls
  })
  expect(calls.every((call: { sessionId?: string }) => call.sessionId === ptyId)).toBe(true)
  await orcaPage.screenshot({ path: testInfo.outputPath('restart-original-terminal.png') })
})

test('SSH Git and folder terminals retain their surfaces through phone activation and desktop restart', async (// oxlint-disable-next-line no-empty-pattern -- The restart fixture owns both isolated launches.
{}, testInfo) => {
  const descriptor = process.env.ORCA_E2E_SURFACE_SSH_FIXTURE
  const template = process.env.ORCA_E2E_ORCAD_CONVERT_TEMPLATE
  test.skip(
    !descriptor || !template,
    'Requires an isolated SSH host and the matching server template'
  )
  // Deploy the isolated SSH server and restart each workspace's desktop.
  test.setTimeout(12 * 60_000)
  const target = SshFixture.parse(JSON.parse(readFileSync(descriptor!, 'utf8')))
  const session = createRestartSession(testInfo, { ORCA_ORCAD_TEMPLATE_PATH: template! })
  const fixture: ManagedHostFixture = {
    host: {
      input: target.input,
      remoteRepoPath: target.repoPath,
      remoteFolderPath: target.folderPath,
      cleanup: () => {}
    },
    session,
    app: null
  }
  try {
    const launched = await launchManagedWorkspace(fixture)
    let page = launched.page
    const { environmentId } = launched
    const worktrees = z
      .object({ worktrees: z.array(z.looseObject({ worktreeId: z.string(), path: z.string() })) })
      .parse(await callEnvironment(page, environmentId, 'worktree.ps', { limit: 1000 })).worktrees
    const evidence: unknown[] = []
    for (const remotePath of [target.repoPath, target.folderPath]) {
      const workspace = worktrees.find((row) => row.path === remotePath)
      if (!workspace) {
        throw new Error(`SSH workspace not listed: ${remotePath}`)
      }
      const original = await createPairedHostTerminal(page, environmentId, workspace.worktreeId, '')
      const marker = `SSH_RECOVERY_${randomUUID().replaceAll('-', '')}`
      const readOutput = async () => {
        const value = await callEnvironment(page, environmentId, 'terminal.read', {
          terminal: original.terminal,
          limit: 200
        })
        return z
          .object({ terminal: z.object({ tail: z.array(z.string()) }) })
          .parse(value)
          .terminal.tail.join('\n')
      }
      await callEnvironment(page, environmentId, 'terminal.send', {
        terminal: original.terminal,
        text: `node -e "console.log('${marker}:'+process.ppid)"`,
        enter: true
      })
      await expect.poll(readOutput, { timeout: 30_000 }).toMatch(new RegExp(`${marker}:\\d+`))
      const pid = (await readOutput()).match(new RegExp(`${marker}:(\\d+)`))?.[1]
      expect(pid).toBeTruthy()
      await openPairedClientTab(page, workspace.worktreeId, original.webTabId)
      await expect
        .poll(() => readPairedPaneContent(page, original.webTabId), { timeout: 30_000 })
        .toContain(marker)
      const inventory = async () =>
        TerminalIdentities.parse(
          await callEnvironment(page, environmentId, 'terminal.list', {
            worktree: `id:${workspace.worktreeId}`,
            requireFreshPtyLiveness: true
          })
        )
      const identities = (value: z.infer<typeof TerminalIdentities>) =>
        value.terminals
          .map((terminal) => ({
            handle: terminal.handle,
            tabId: terminal.tabId,
            leafId: terminal.leafId,
            ptyId: terminal.ptyId,
            incarnationId: terminal.incarnationId
          }))
          .sort((a, b) => a.handle.localeCompare(b.handle))
      const before = identities(await inventory())
      await recordTerminalIdentity(testInfo, `ssh-before-activation-${evidence.length}`, {
        original,
        before
      })
      expect(before.find((row) => row.handle === original.terminal)?.incarnationId).toBeTruthy()
      const phone = pairMobileClient(await createDesktopMobilePairingOffer(page))
      try {
        const socket = await phone.openSocket()
        const activate = () =>
          callPhoneHost(socket, toRuntimeExecutionHostId(environmentId), 'worktree.activate', {
            worktree: `id:${workspace.worktreeId}`,
            navigation: 'caller'
          })
        for (let round = 0; round < 3; round += 1) {
          await activate()
        }
        await Promise.all([activate(), activate(), activate()])
        expect(identities(await inventory())).toEqual(before)
        await callPhoneHost(socket, toRuntimeExecutionHostId(environmentId), 'worktree.activate', {
          worktree: `id:${workspace.worktreeId}`,
          navigation: 'clients'
        })
        await expect(page.locator('[data-rendered-active-worktree-id]')).toHaveAttribute(
          'data-rendered-active-worktree-id',
          workspace.worktreeId
        )
      } finally {
        phone.dispose()
      }
      page = await relaunchManagedApp(fixture)
      await openPairedClientTab(page, workspace.worktreeId, original.webTabId)
      await expect
        .poll(() => readPairedPaneContent(page, original.webTabId), { timeout: 30_000 })
        .toContain(marker)
      const after = identities(await inventory())
      expect(after).toEqual(before)
      await callEnvironment(page, environmentId, 'terminal.send', {
        terminal: original.terminal,
        text: `node -e "console.log('AFTER_${marker}:'+process.ppid)"`,
        enter: true
      })
      await expect.poll(readOutput).toContain(`AFTER_${marker}:${pid}`)
      evidence.push({ remotePath, before, after, pid, sameOutput: true })
    }
    await page.screenshot({ path: testInfo.outputPath('ssh-original-terminals.png') })
    await recordTerminalIdentity(testInfo, 'ssh-identity', evidence)
  } finally {
    await session.dispose(fixture.app ?? undefined)
  }
})
