import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { runProcessSync } from '@orca/process-host'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady, waitForStartupWorktreeRefresh } from './helpers/store'
import { reserveLocalPort } from './helpers/reserve-local-port'
import { focusActiveTerminalInput, getTerminalContent } from './helpers/terminal'
import { decodePairingOffer, encodePairingOffer } from '../../src/shared/pairing'
import { launchHeadlessPairedRuntimeHost } from './helpers/headless-paired-runtime-host'
import { launchPairedElectronClient } from './helpers/paired-electron-client'
import { projectHostSetupProjectionFromRepos } from '../../src/shared/project-host-setup-projection'
import { quotePosixShell } from '../../src/shared/shell-argument-quoting'
import { quotePowerShellLiteral } from '../../src/shared/powershell-native-argument'
import type { Repo } from '../../src/shared/repo-types'
import type { Worktree } from '../../src/shared/worktree/types'

test.use({ seedTestRepo: false })

test('groups equal display names, keeps native identities, and separates on rename', async ({
  orcaPage
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await waitForStartupWorktreeRefresh(orcaPage)
  await orcaPage.evaluate(() => window.__store!.getState().awaitLocalRepoCatalogSettlement())
  const hosts = ['local', 'ssh:mini', 'runtime:dbox'] as const
  const repos: Repo[] = hosts.map((host, index) => ({
    id: `workspace-${index}`,
    path: `/workspace/${index}`,
    displayName: 'workspace',
    badgeColor: '#737373',
    addedAt: index,
    kind: 'folder',
    executionHostId: host
  }))
  repos.push(
    ...hosts.slice(1).map((host, index): Repo => ({
      id: `movo-${index}`,
      path: `/movo/${index}`,
      displayName: 'Movo',
      kind: 'git',
      badgeColor: '#737373',
      addedAt: index + 3,
      executionHostId: host,
      upstream: { owner: 'Mangi-11', repo: 'Eta' }
    }))
  )
  const worktrees: Worktree[] = repos.map((repo, index) => ({
    id: `${repo.id}::${repo.path}`,
    repoId: repo.id,
    hostId: repo.executionHostId ?? 'local',
    path: repo.path,
    head: repo.kind === 'folder' ? '' : 'abc123',
    branch:
      repo.kind === 'folder' ? '' : index === 3 ? 'refs/heads/feat/chat-mode' : 'refs/heads/main',
    displayName: index === 3 ? 'feat/chat-mode' : index === 4 ? 'main' : repo.displayName,
    isBare: false,
    isMainWorktree: true,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: index,
    lastActivityAt: 1
  }))
  const seed = async (nextRepos = repos) => {
    const projection = projectHostSetupProjectionFromRepos(nextRepos)
    await orcaPage.evaluate(
      async ({ repos, projection, worktrees }) => {
        const collapsed = repos.map((repo) => `project:repo:${repo.id}`)
        await window.api.ui.set({ collapsedGroups: collapsed })
        window.__store!.setState({
          repos,
          projects: [...projection.projects],
          projectHostSetups: [...projection.setups],
          worktreesByRepo: Object.fromEntries(
            repos.map((repo) => [
              repo.id,
              worktrees.filter((worktree) => worktree.repoId === repo.id)
            ])
          ),
          groupBy: 'repo',
          projectOrderBy: 'manual',
          collapsedGroups: new Set(collapsed),
          filterRepoIds: [],
          visibleWorkspaceHostIds: null,
          workspaceHostScope: 'all',
          hideDefaultBranchWorkspace: false,
          showSleepingWorkspaces: true,
          hideAutomationGeneratedWorkspaces: false,
          hideCliCreatedWorkspaces: false
        })
      },
      { repos: nextRepos, projection, worktrees }
    )
  }
  await seed()
  const rows = () => orcaPage.locator('[data-worktree-section-key="sidebar-name:workspace"]')
  await expect(rows()).toHaveCount(3)
  const workspaceHeader = orcaPage.locator('[data-repo-header-id="workspace-0"]')
  await workspaceHeader.press('Enter')
  await expect(rows()).toHaveCount(0)
  await workspaceHeader.press('Enter')
  await expect(rows()).toHaveCount(3)
  expect(await orcaPage.evaluate(() => [...window.__store!.getState().collapsedGroups])).toEqual(
    repos.map((repo) => `project:repo:${repo.id}`)
  )
  for (const mode of ['none', 'workspace-status', 'pr-status'] as const) {
    await orcaPage.evaluate((groupBy) => {
      window.__store!.getState().setGroupBy(groupBy)
      window.__store!.getState().revealSidebarRow('project:repo:workspace-0')
    }, mode)
    await expect
      .poll(() => orcaPage.evaluate(() => window.__store!.getState().groupBy))
      .toBe('repo')
    await expect
      .poll(() => orcaPage.evaluate(() => window.__store!.getState().pendingRevealSidebarRow))
      .toBeNull()
  }
  await workspaceHeader.press('Enter')
  await expect(rows()).toHaveCount(0)
  await orcaPage.evaluate(
    ({ id, host }) => {
      window.__store!.getState().revealWorktreeInSidebar(id, { executionHostId: host })
    },
    { id: worktrees[2].id, host: hosts[2] }
  )
  await expect(rows()).toHaveCount(3)
  await expect(
    orcaPage.locator('[data-worktree-section-key="project:github:mangi-11/eta"]')
  ).toHaveCount(2)
  await orcaPage.evaluate(() =>
    window.__store!.setState({
      visibleWorkspaceHostIds: ['local', 'ssh:mini', 'runtime:dbox'],
      collapsedGroups: new Set()
    })
  )
  await expect(orcaPage.locator('[data-repo-header-id^="workspace-"]')).toHaveCount(3)
  for (const id of ['workspace-0', 'workspace-1', 'workspace-2']) {
    await expect(orcaPage.locator(`[data-repo-header-id="${id}"]`)).toBeVisible()
  }
  await orcaPage.screenshot({
    path: testInfo.outputPath('original-host-containers.png'),
    animations: 'disabled'
  })
  await orcaPage.evaluate(() => window.__store!.setState({ visibleWorkspaceHostIds: null }))
  await expect(rows()).toHaveCount(3)
  const nestedRepos = repos.map((repo) =>
    repo.id.startsWith('workspace-') ? { ...repo, projectGroupId: 'child' } : repo
  )
  const nestedProjection = projectHostSetupProjectionFromRepos(nestedRepos)
  await orcaPage.evaluate(
    ({ repos, projection }) => {
      window.__store!.setState({
        repos,
        projects: [...projection.projects],
        projectHostSetups: [...projection.setups],
        projectGroups: ['parent', 'child'].map((id) => ({
          id,
          name: id,
          parentGroupId: id === 'child' ? 'parent' : null,
          parentPath: null,
          createdFrom: 'migration',
          tabOrder: 0,
          isCollapsed: false,
          color: null,
          createdAt: 1,
          updatedAt: 1
        })),
        collapsedGroups: new Set([
          'project-group:parent',
          'project-group:child',
          'sidebar-name:workspace::group:child'
        ])
      })
      window.__store!.getState().revealSidebarRow('project:repo:workspace-0')
    },
    { repos: nestedRepos, projection: nestedProjection }
  )
  await expect(workspaceHeader).toBeVisible()
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store!.getState().pendingRevealSidebarRow))
    .toBeNull()
  expect(await orcaPage.evaluate(() => [...window.__store!.getState().collapsedGroups])).toEqual([
    'sidebar-name:workspace::group:child'
  ])
  await orcaPage.evaluate(
    ({ id, host }) => {
      window.__store!.getState().revealWorktreeInSidebar(id, { executionHostId: host })
    },
    { id: worktrees[2].id, host: hosts[2] }
  )
  await expect(
    orcaPage.locator('[data-worktree-section-key="sidebar-name:workspace::group:child"]')
  ).toHaveCount(3)
  await orcaPage.screenshot({
    path: testInfo.outputPath('nested-group-reveal.png'),
    animations: 'disabled'
  })
  await orcaPage.evaluate(() => window.__store!.setState({ projectGroups: [] }))
  await seed()
  const original = await orcaPage.evaluate(() => ({
    projects: window.__store!.getState().projects.map(({ id }) => id),
    setups: window
      .__store!.getState()
      .projectHostSetups.map(({ repoId, projectId }) => ({ repoId, projectId }))
  }))
  expect(
    original.setups
      .filter((setup) => setup.repoId.startsWith('workspace-'))
      .map((setup) => setup.projectId)
  ).toEqual(['repo:workspace-0', 'repo:workspace-1', 'repo:workspace-2'])
  await orcaPage.screenshot({
    path: testInfo.outputPath('same-name-three-hosts.png'),
    animations: 'disabled'
  })
  await seed(
    repos.map((repo) =>
      repo.id === 'workspace-2' ? { ...repo, displayName: 'workspace-dbox' } : repo
    )
  )
  await expect(rows()).toHaveCount(2)
  const separatedRows = orcaPage.locator('[data-worktree-section-key="project:repo:workspace-2"]')
  await expect(separatedRows).toHaveCount(0)
  await orcaPage.locator('[data-repo-header-id="workspace-2"]').press('Enter')
  await expect(separatedRows).toHaveCount(1)
  await orcaPage.screenshot({
    path: testInfo.outputPath('renamed-directory-separated.png'),
    animations: 'disabled'
  })
  await orcaPage.reload()
  await waitForSessionReady(orcaPage)
  await waitForStartupWorktreeRefresh(orcaPage)
  await orcaPage.evaluate(() => window.__store!.getState().awaitLocalRepoCatalogSettlement())
  await seed()
  await expect(rows()).toHaveCount(3)
})

test('merges local and paired-host folders while preserving the remote workspace and execution route', async ({
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-merge-hosts-'))
  registerPostElectronShutdownCleanup(async () => {
    rmSync(root, { recursive: true, force: true })
  })
  const localPath = path.join(root, 'local', 'workspace')
  const remotePath = path.join(root, 'remote', 'workspace')
  mkdirSync(localPath, { recursive: true })
  mkdirSync(remotePath, { recursive: true })
  const gitPaths = [path.join(root, 'local', 'Movo'), path.join(root, 'remote', 'Movo-remote')]
  const hooks = path.join(root, 'empty-hooks')
  mkdirSync(hooks)
  for (const directory of gitPaths) {
    mkdirSync(directory, { recursive: true })
    for (const args of [
      ['init', `--template=${hooks}`],
      ['symbolic-ref', 'HEAD', 'refs/heads/main'],
      [
        '-c',
        'user.name=Orca Test',
        '-c',
        'user.email=orca-test@example.invalid',
        '-c',
        `core.hooksPath=${hooks}`,
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--allow-empty',
        '-m',
        'fixture'
      ],
      ['remote', 'add', 'origin', 'ssh://git@127.0.0.1/name-merge/Movo.git']
    ]) {
      const result = runProcessSync({ program: 'git', args: ['-C', directory, ...args] })
      expect(result.code, result.stderr).toBe(0)
    }
  }
  const host = await launchHeadlessPairedRuntimeHost()
  let client: Awaited<ReturnType<typeof launchPairedElectronClient>> | null = null
  let closeTunnel: (() => void) | undefined
  try {
    const remote = await host.client.call<{ repo: Repo }>('repo.add', {
      path: remotePath,
      kind: 'folder',
      displayName: 'workspace'
    })
    // Match the known no-upstream state; exclude the settings page's existing first-open probe.
    await host.client.call('repo.update', {
      repo: `id:${remote.result.repo.id}`,
      updates: { upstream: null }
    })
    const remoteGit = await host.client.call<{ repo: Repo }>('repo.add', {
      path: gitPaths[1],
      kind: 'git',
      displayName: 'Movo-remote'
    })
    const listing = await host.client.call<{ worktrees: Worktree[] }>('worktree.list', {
      repo: `id:${remote.result.repo.id}`
    })
    const remoteWorktree = listing.result.worktrees[0]
    expect(remoteWorktree).toBeTruthy()
    let offer = host.offer
    const sshTarget = process.env.ORCA_E2E_PROJECT_MERGE_SSH_TARGET
    if (sshTarget) {
      const decoded = decodePairingOffer(offer.pairingUrl)
      const endpoint = new URL(decoded.endpoint)
      const reservation = await reserveLocalPort()
      await reservation.release()
      const controlRoot = mkdtempSync(path.join(os.tmpdir(), 'oms-'))
      const control = path.join(controlRoot, 'control')
      const sshArgs = [
        '-S',
        control,
        '-p',
        process.env.ORCA_E2E_PROJECT_MERGE_SSH_PORT ?? '22',
        ...(process.env.ORCA_E2E_PROJECT_MERGE_SSH_IDENTITY
          ? ['-i', process.env.ORCA_E2E_PROJECT_MERGE_SSH_IDENTITY, '-oIdentitiesOnly=yes']
          : []),
        ...(process.env.ORCA_E2E_PROJECT_MERGE_SSH_KNOWN_HOSTS
          ? ['-o', `UserKnownHostsFile=${process.env.ORCA_E2E_PROJECT_MERGE_SSH_KNOWN_HOSTS}`]
          : [])
      ]
      try {
        execFileSync(
          'ssh',
          [
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
          { timeout: 15_000, stdio: 'pipe' }
        )
      } catch (error) {
        rmSync(controlRoot, { recursive: true, force: true })
        throw error
      }
      closeTunnel = () => {
        try {
          execFileSync('ssh', [...sshArgs, '-O', 'exit', sshTarget], {
            timeout: 5_000,
            stdio: 'pipe'
          })
        } finally {
          rmSync(controlRoot, { recursive: true, force: true })
        }
      }
      endpoint.hostname = '127.0.0.1'
      endpoint.port = String(reservation.port)
      offer = { pairingUrl: encodePairingOffer({ ...decoded, endpoint: endpoint.toString() }) }
      await testInfo.attach('transport', {
        body: 'Authenticated OpenSSH TCP forward',
        contentType: 'text/plain'
      })
    }
    client = await launchPairedElectronClient(offer, testInfo, 'merge-host')
    await client.page.evaluate(async (localPath) => {
      const added = await window.api.repos.add({ path: localPath, kind: 'folder' })
      if ('error' in added) {
        throw new Error(added.error)
      }
      const repo = added.repo
      await window.__store!.getState().awaitLocalRepoCatalogSettlement()
      await window.__store!.getState().fetchWorktrees(repo.id)
      return repo.id
    }, localPath)
    await client.page.evaluate(async (directory) => {
      const result = await window.api.repos.add({ path: directory, kind: 'git' })
      if ('error' in result) {
        throw new Error(result.error)
      }
      await window.__store!.getState().awaitLocalRepoCatalogSettlement()
      await window.__store!.getState().fetchWorktrees(result.repo.id)
    }, gitPaths[0])
    await expect
      .poll(() =>
        client!.page.evaluate(
          (id) => window.__store!.getState().repos.some((repo) => repo.id === id),
          remote.result.repo.id
        )
      )
      .toBe(true)
    await client.page.evaluate(async (remoteId) => {
      const state = window.__store!.getState()
      await state.reorderRepos([
        remoteId,
        ...state.repos.filter((repo) => repo.id !== remoteId).map((repo) => repo.id)
      ])
      state.updateSettings({ uiLanguage: 'en' })
      window.__store!.setState({
        groupBy: 'repo',
        projectOrderBy: 'manual',
        visibleWorkspaceHostIds: null,
        workspaceHostScope: 'all',
        showSleepingWorkspaces: true,
        hideDefaultBranchWorkspace: false,
        collapsedGroups: new Set()
      })
    }, remote.result.repo.id)
    const sectionKey = 'sidebar-name:workspace'
    const rows = client.page.locator(`[data-worktree-section-key="${sectionKey}"]`)
    await expect(rows).toHaveCount(2)
    const gitProjects = await host.client.call<{
      projects: { id: string; sourceRepoIds: string[] }[]
    }>('project.list')
    const gitProjectId = gitProjects.result.projects.find((project) =>
      project.sourceRepoIds.includes(remoteGit.result.repo.id)
    )?.id
    expect(gitProjectId).toMatch(/^git:/)
    await expect(
      client.page.locator(`[data-worktree-section-key="project:${gitProjectId}"]`)
    ).toHaveCount(2)
    const target = client.page.locator(
      `[data-worktree-id="${remoteWorktree.id}"][data-worktree-section-key="${sectionKey}"]`
    )
    await target.click()
    await expect
      .poll(() =>
        client!.page.evaluate(() => window.__store!.getState().activeWorkspaceExecutionHostId)
      )
      .toBe(`runtime:${client.environmentId}`)
    type TerminalIdentity = {
      handle: string
      ptyId: string
      incarnationId?: string
      connected: boolean
      writable: boolean
    }
    const listTerminals = async () =>
      (
        await host.client.call<{ terminals: TerminalIdentity[] }>('terminal.list', {
          worktree: `id:${remoteWorktree.id}`
        })
      ).result.terminals
    await expect.poll(async () => (await listTerminals()).length).toBeGreaterThan(0)
    const beforeTerminals = (await listTerminals()).map(({ handle, ptyId, incarnationId }) => ({
      handle,
      ptyId,
      incarnationId
    }))
    const after = await host.client.call<{ worktrees: Worktree[] }>('worktree.list', {
      repo: `id:${remote.result.repo.id}`
    })
    expect(after.result.worktrees.map((entry) => entry.id)).toEqual(
      listing.result.worktrees.map((entry) => entry.id)
    )
    const remoteRepos = (await host.client.call<{ repos: Repo[] }>('repo.list')).result.repos
    expect(remoteRepos.find((repo) => repo.id === remote.result.repo.id)).toMatchObject({
      id: remote.result.repo.id,
      path: remotePath,
      kind: 'folder'
    })
    await client.page.screenshot({ path: testInfo.outputPath('paired-host-merge.png') })
    const beforeRename = (
      await host.client.call<{ repo: Repo }>('repo.show', { repo: `id:${remote.result.repo.id}` })
    ).result.repo
    const header = client.page.locator(`[data-repo-header-id="${remote.result.repo.id}"]`)
    await expect(header).toBeVisible()
    await header.hover()
    await header.getByRole('button', { name: 'Project actions for workspace', exact: true }).click()
    const settings = client.page.getByRole('menuitem', { name: 'Project Settings', exact: true })
    await expect(settings).toBeVisible()
    await expect(client.page.getByRole('menuitem').filter({ hasText: remotePath })).toHaveCount(0)
    await client.page.screenshot({
      path: testInfo.outputPath('original-project-actions-menu.png'),
      animations: 'disabled'
    })
    await settings.click()
    const nameInput = client.page.getByLabel('Display Name', { exact: true })
    await expect(nameInput).toHaveValue('workspace')
    await expect(client.page.getByText(remotePath, { exact: true }).first()).toBeVisible()
    await nameInput.fill('workspace-dbox')
    await nameInput.press('Tab')
    await expect
      .poll(
        async () =>
          (
            await host.client.call<{ repo: Repo }>('repo.show', {
              repo: `id:${remote.result.repo.id}`
            })
          ).result.repo.displayName
      )
      .toBe('workspace-dbox')
    const renamedRepo = (
      await host.client.call<{ repo: Repo }>('repo.show', { repo: `id:${remote.result.repo.id}` })
    ).result.repo
    expect({ ...renamedRepo, displayName: beforeRename.displayName }).toEqual(beforeRename)
    await client.page.evaluate(() => window.__store!.getState().closeSettingsPage())
    await expect(rows).toHaveCount(0)
    await expect(
      client.page.locator(
        `[data-worktree-id="${remoteWorktree.id}"][data-worktree-section-key="project:repo:${remote.result.repo.id}"]`
      )
    ).toHaveCount(1)
    const afterTerminals = await listTerminals()
    expect(
      afterTerminals.map(({ handle, ptyId, incarnationId }) => ({ handle, ptyId, incarnationId }))
    ).toEqual(beforeTerminals)
    expect(afterTerminals.every((terminal) => terminal.connected && terminal.writable)).toBe(true)
    const token = String(Date.now())
    await focusActiveTerminalInput(client.page)
    const nodeCommand =
      process.platform === 'win32'
        ? `& ${quotePowerShellLiteral(process.execPath)}`
        : quotePosixShell(process.execPath)
    await client.page.keyboard.type(
      `${nodeCommand} -e "console.log('ORCA_NAME_GROUP_' + '${token}')"`
    )
    await client.page.keyboard.press('Enter')
    await expect.poll(() => getTerminalContent(client!.page)).toContain(`ORCA_NAME_GROUP_${token}`)
    await testInfo.attach('preserved-terminal-identities', {
      body: JSON.stringify(beforeTerminals),
      contentType: 'application/json'
    })
    await client.page.screenshot({
      path: testInfo.outputPath('remote-renamed-through-settings.png')
    })
    await client.page.reload()
    await waitForSessionReady(client.page)
    await expect
      .poll(() =>
        client!.page.evaluate(
          (id) => window.__store!.getState().repos.find((repo) => repo.id === id)?.displayName,
          remote.result.repo.id
        )
      )
      .toBe('workspace-dbox')
    await expect(
      client.page.locator(
        `[data-worktree-id="${remoteWorktree.id}"][data-worktree-section-key="project:repo:${remote.result.repo.id}"]`
      )
    ).toHaveCount(1)
    const afterRename = await host.client.call<{ worktrees: Worktree[] }>('worktree.list', {
      repo: `id:${remote.result.repo.id}`
    })
    expect(
      afterRename.result.worktrees.map(({ id, instanceId, path, projectId }) => ({
        id,
        instanceId,
        path,
        projectId
      }))
    ).toEqual(
      listing.result.worktrees.map(({ id, instanceId, path, projectId }) => ({
        id,
        instanceId,
        path,
        projectId
      }))
    )
    expect(await client.getDirectSshAttemptTargetIds()).toEqual([])
  } finally {
    await client?.dispose()
    closeTunnel?.()
    await host.dispose()
    rmSync(root, { recursive: true, force: true })
  }
})
