import { runProcessSync } from '@orca/process-host'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady, waitForStartupWorktreeRefresh } from './helpers/store'
import { launchHeadlessPairedRuntimeHost } from './helpers/headless-paired-runtime-host'
import { launchPairedElectronClient } from './helpers/paired-electron-client'
import { waitForPairedClientWorktree } from './helpers/paired-client-host-session'
import { reserveLocalPort } from './helpers/reserve-local-port'
import { decodePairingOffer, encodePairingOffer } from '../../src/shared/pairing'
import type { Repo } from '../../src/shared/repo-types'
import type { Worktree } from '../../src/shared/worktree/types'

test('history-only restoration keeps local workspaces without extra sidebar rows', async ({
  orcaPage
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await waitForStartupWorktreeRefresh(orcaPage)
  const before = await orcaPage.locator('[data-repo-header-id]').count()
  await orcaPage.evaluate(async () => {
    const state = window.__store!.getState()
    const session = await window.api.session.get()
    const removed = 'removed-history::/srv/history-only'
    state.hydrateWorkspaceSession(
      {
        ...session,
        activeTabTypeByWorktree: { ...session.activeTabTypeByWorktree, [removed]: 'terminal' },
        lastVisitedAtByWorktreeId: { ...session.lastVisitedAtByWorktreeId, [removed]: 1 }
      },
      { runtimeHostIdByWorkspaceSessionKey: { [removed]: 'runtime:old-host' } }
    )
  })
  await expect(orcaPage.locator('[data-repo-header-id]')).toHaveCount(before)
  await expect(orcaPage.locator('[data-worktree-id^="removed-history::"]')).toHaveCount(0)
  await expect(orcaPage.getByText('Unknown', { exact: true })).toHaveCount(0)
  await orcaPage.screenshot({
    path: testInfo.outputPath('local-history-restored.png'),
    animations: 'disabled'
  })
})

test('retains a named remote editor through catalog removal and client restart', async ({
  orcaAppExtraEnv
}, testInfo) => {
  test.setTimeout(240_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-workspace-recovery-'))
  const projectPath = path.join(root, 'recovered-project')
  const filePath = path.join(projectPath, 'recovery.txt')
  mkdirSync(projectPath)
  writeFileSync(filePath, 'RECOVERY_DISK_CONTENT\n')
  const host = await launchHeadlessPairedRuntimeHost({ extraEnv: orcaAppExtraEnv })
  let client: Awaited<ReturnType<typeof launchPairedElectronClient>> | undefined
  let closeTunnel: (() => void) | undefined
  let controlDirectory: string | undefined
  try {
    let offer = host.offer
    const sshTarget = process.env.ORCA_E2E_RECOVERY_SSH_TARGET
    if (sshTarget) {
      const decoded = decodePairingOffer(offer.pairingUrl)
      const endpoint = new URL(decoded.endpoint)
      const reservation = await reserveLocalPort()
      await reservation.release()
      controlDirectory = mkdtempSync(path.join(os.tmpdir(), 'ors-'))
      const control = path.join(controlDirectory, 'control')
      const sshArgs = [
        '-S',
        control,
        '-p',
        process.env.ORCA_E2E_RECOVERY_SSH_PORT ?? '22',
        ...(process.env.ORCA_E2E_RECOVERY_SSH_IDENTITY
          ? ['-i', process.env.ORCA_E2E_RECOVERY_SSH_IDENTITY, '-oIdentitiesOnly=yes']
          : []),
        ...(process.env.ORCA_E2E_RECOVERY_SSH_KNOWN_HOSTS
          ? ['-o', `UserKnownHostsFile=${process.env.ORCA_E2E_RECOVERY_SSH_KNOWN_HOSTS}`]
          : [])
      ]
      const tunnel = runProcessSync({
        program: 'ssh',
        args: [
          ...sshArgs,
          '-M',
          '-fNT',
          '-oBatchMode=yes',
          '-oStrictHostKeyChecking=yes',
          '-oExitOnForwardFailure=yes',
          '-L',
          `127.0.0.1:${reservation.port}:${endpoint.hostname}:${endpoint.port}`,
          sshTarget
        ],
        timeoutMs: 15_000,
        maxOutputBytes: 1024 * 1024
      })
      if (tunnel.code !== 0) {
        throw new Error(`SSH tunnel failed: ${tunnel.stderr}`)
      }
      closeTunnel = () => {
        const closed = runProcessSync({
          program: 'ssh',
          args: [...sshArgs, '-O', 'exit', sshTarget],
          timeoutMs: 5_000,
          maxOutputBytes: 1024 * 1024
        })
        if (closed.code !== 0) {
          throw new Error(`SSH tunnel close failed: ${closed.stderr}`)
        }
      }
      endpoint.hostname = '127.0.0.1'
      endpoint.port = String(reservation.port)
      offer = { pairingUrl: encodePairingOffer({ ...decoded, endpoint: endpoint.toString() }) }
    }
    await testInfo.attach('transport', {
      body: sshTarget ? 'Authenticated SSH TCP forward' : 'Loopback paired runtime',
      contentType: 'text/plain'
    })
    const added = await host.client.call<{ repo: Repo }>('repo.add', {
      path: projectPath,
      kind: 'folder'
    })
    const repoId = added.result.repo.id
    const listing = await host.client.call<{ worktrees: Worktree[] }>('worktree.list', {
      repo: `id:${repoId}`
    })
    const worktree = listing.result.worktrees[0]
    expect(worktree).toBeTruthy()
    client = await launchPairedElectronClient(offer, testInfo, 'recovery-host')
    await waitForPairedClientWorktree(client.page, worktree.id)
    await client.page.evaluate(
      ({ worktree, environmentId }) => {
        const state = window.__store!.getState()
        state.setActiveWorktree(worktree.id, `runtime:${environmentId}`)
      },
      { worktree, environmentId: client.environmentId }
    )
    await expect(client.page.getByRole('textbox', { name: 'Terminal input' })).toBeVisible()
    await client.page.getByRole('button', { name: 'recovery.txt', exact: true }).dblclick()
    await expect(
      client.page
        .locator('.monaco-editor .view-lines')
        .getByText('RECOVERY_DISK_CONTENT', { exact: false })
    ).toBeVisible()
    await client.page.evaluate(
      ({ worktreeId, environmentId }) => {
        const store = window.__store!
        const state = store.getState()
        const file = state.openFiles.find((entry) => entry.worktreeId === worktreeId)
        if (!file) {
          throw new Error('Editor did not open')
        }
        state.setEditorDraft(file.id, 'RECOVERY_UNSAVED_DRAFT\n')
        state.markFileDirty(file.id, true)
        const removed = 'removed-history::/srv/history-only'
        store.setState({
          restoredRuntimeHostIdByWorkspaceSessionKey: {
            ...state.restoredRuntimeHostIdByWorkspaceSessionKey,
            [worktreeId]: `runtime:${environmentId}`,
            [removed]: `runtime:${environmentId}`
          },
          activeTabTypeByWorktree: { ...state.activeTabTypeByWorktree, [removed]: 'terminal' }
        })
      },
      { worktreeId: worktree.id, environmentId: client.environmentId }
    )
    await host.client.call('projectHostSetup.delete', {
      setupId: repoId,
      hostId: 'local',
      force: true
    })
    await client.page.evaluate(async (environmentId) => {
      await window.__store!.getState().fetchRuntimeEnvironmentRepos(environmentId)
    }, client.environmentId)
    await expect(client.page.getByText('Unknown', { exact: true })).toHaveCount(0)
    await expect(client.page.locator(`[data-repo-header-id="${repoId}"]`)).toContainText(
      'recovered-project'
    )
    await expect
      .poll(() =>
        client!.page.evaluate((worktreeId) => {
          const state = window.__store!.getState()
          return state.openFiles
            .filter((file) => file.worktreeId === worktreeId)
            .map((file) => state.editorDrafts[file.id])
        }, worktree.id)
      )
      .toEqual(['RECOVERY_UNSAVED_DRAFT\n'])
    const profile = client.userDataDir
    await client.quitPreservingProfile()
    client = undefined
    client = await launchPairedElectronClient(offer, testInfo, 'recovery-host', {
      reuseUserDataDir: profile
    })
    await expect(client.page.locator(`[data-repo-header-id="${repoId}"]`)).toContainText(
      'recovered-project'
    )
    await expect(client.page.getByText('Unknown', { exact: true })).toHaveCount(0)
    await expect(client.page.locator('[data-repo-header-id="removed-history"]')).toHaveCount(0)
    await expect(client.page.getByRole('button', { name: /^recovery\.txt/ }).first()).toBeVisible()
    await expect
      .poll(() =>
        client!.page.evaluate((worktreeId) => {
          const state = window.__store!.getState()
          return state.openFiles
            .filter((file) => file.worktreeId === worktreeId)
            .map((file) => ({
              draft: state.editorDrafts[file.id],
              environmentId: file.runtimeEnvironmentId
            }))
        }, worktree.id)
      )
      .toEqual([{ draft: 'RECOVERY_UNSAVED_DRAFT\n', environmentId: client.environmentId }])
    const registered = await host.client.call<{ repos: Repo[] }>('repo.list', {})
    expect(registered.result.repos.some((repo) => repo.id === repoId)).toBe(false)
    await client.page.screenshot({
      path: testInfo.outputPath('remote-recovery-after-restart.png'),
      animations: 'disabled'
    })
  } finally {
    await client?.dispose()
    closeTunnel?.()
    if (controlDirectory) {
      rmSync(controlDirectory, { recursive: true, force: true })
    }
    await host.dispose()
    rmSync(root, { recursive: true, force: true })
  }
})
