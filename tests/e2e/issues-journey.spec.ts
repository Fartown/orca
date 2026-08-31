import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import type { ConversationSummary, IssueSummary } from '../../src/shared/issues/types'
import { parsePaneKey } from '../../src/shared/stable-pane-id'
import { expect, test } from './helpers/orca-app'
import { attachRepoAndOpenTerminal } from './helpers/orca-restart'
import { configureGoldenStubAgent } from './helpers/golden-stub-agent'
import {
  captureJourneyScreenshot,
  closeConversationPane,
  createChildIssue,
  createFolderWorkspaceAndActivate,
  createIssueFromDialog,
  issueTitle,
  launchConversationFromIssue,
  launchOrdinaryFolderConversation,
  localIssuesRegion,
  openIssueDetail,
  openIssuesMode,
  openSessionHistory,
  openWorkspacesMode,
  refreshIssueDetail,
  resumeUnassignedConversationFromIssuesSidebar,
  waitForConversation
} from './helpers/issues-journey-actions'
import {
  bindConversationFromIssueDetail,
  updateConversationIssueFromIssueRow
} from './helpers/issues-journey-binding-actions'
import { ensureJourneySshTarget } from './helpers/issues-journey-maintenance-actions'
import {
  renameAndCompareConversationRows,
  verifyIssueEditConflict
} from './helpers/issues-journey-edit-actions'
import {
  createPackagedIssuesJourney,
  listConversations,
  listIssues,
  listRounds,
  runtimeRpc,
  transferProject
} from './helpers/packaged-issues-journey'
import { readConversationProviderSessionId } from './helpers/issues-journey-database'

const SCREENSHOT_DIR = path.join(process.cwd(), '.docs', '并行任务看板', 'goal', 'screenshots')
const PROFILE_A = 'local-default'

test.setTimeout(15 * 60_000)

test('真实打包 App Issues 16 步旅程 @issues-journey', async ({ testRepoPath }, testInfo) => {
  const journey = createPackagedIssuesJourney(testInfo)
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  let app: ElectronApplication | null = null
  let page: Page | null = null
  let primaryWorktreeId = ''
  let primaryWorktreeLabel = ''
  let primaryWorktreePath = ''
  let repoId = ''
  let rootIssue: IssueSummary
  let externalIssue: IssueSummary
  let sshIssue: IssueSummary
  let sshTargetId = ''
  let firstConversation: ConversationSummary
  let folderConversation: ConversationSummary
  let continuedConversation: ConversationSummary
  let folderWorkspaceId = ''
  let folderProviderSessionId = ''
  let profileB = ''
  let profileC = ''

  const launch = async (extraEnv?: Record<string, string>): Promise<Page> => {
    const launched = await journey.launch(extraEnv)
    app = launched.app
    page = launched.page
    return launched.page
  }
  const close = async (): Promise<void> => {
    if (app) {
      await journey.close(app)
    }
    app = null
    page = null
  }
  const currentPage = (): Page => {
    if (!page) {
      throw new Error('Issues journey App is not running')
    }
    return page
  }

  try {
    await test.step('1. 启动 build:unpack 隔离 profile', async () => {
      const activePage = await launch()
      primaryWorktreeId = await attachRepoAndOpenTerminal(activePage, testRepoPath)
      await configureGoldenStubAgent(activePage)
      const workspace = await activePage.evaluate((worktreeId) => {
        const state = window.__store?.getState()
        const worktree = Object.values(state?.worktreesByRepo ?? {})
          .flat()
          .find((candidate) => candidate.id === worktreeId)
        if (!worktree) {
          throw new Error('Primary worktree is unavailable')
        }
        return { label: worktree.displayName, path: worktree.path, repoId: worktree.repoId }
      }, primaryWorktreeId)
      primaryWorktreeLabel = workspace.label
      primaryWorktreePath = workspace.path
      repoId = workspace.repoId
      expect(journey.userDataDir).not.toBe(journey.isolatedHome)
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '01-isolated-packaged-profile.png')
    })

    await test.step('2. 创建本地 Issue 与外部 URL 引用', async () => {
      const activePage = currentPage()
      await openIssuesMode(activePage)
      rootIssue = await createIssueFromDialog(activePage, 'Journey root Issue')
      externalIssue = await createIssueFromDialog(activePage, 'Journey external Issue', {
        identifier: '#4242',
        url: 'https://example.test/issues/4242'
      })
      await openIssueDetail(activePage, externalIssue.id)
      await expect(activePage.getByRole('link', { name: 'github #4242' })).toHaveAttribute(
        'href',
        'https://example.test/issues/4242'
      )

      rootIssue = await verifyIssueEditConflict(activePage, rootIssue)
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '02-local-and-external-issues.png')
    })

    await test.step('3. 验证三级层级以及第四级、自环、跨主机阻止', async () => {
      const activePage = currentPage()
      const child = await createChildIssue(activePage, rootIssue.id, 'Journey child Issue')
      const grandchild = await createChildIssue(activePage, child.id, 'Journey grandchild Issue')
      await refreshIssueDetail(activePage, grandchild.id)
      await expect(activePage.getByRole('button', { name: 'Child', exact: true })).toBeDisabled()
      await expect(activePage.getByRole('button', { name: 'Child', exact: true })).toHaveAttribute(
        'title',
        'Issue hierarchy is limited to three levels'
      )

      sshTargetId = await ensureJourneySshTarget(activePage)
      const sshCreated = await runtimeRpc<{ issue: IssueSummary }>(
        activePage,
        'issues.create',
        {
          mutationId: randomUUID(),
          source: { kind: 'local', title: 'Journey SSH Issue' }
        },
        `ssh:${sshTargetId}`
      )
      sshIssue = sshCreated.issue
      const snapshot = await runtimeRpc<{
        status: 'snapshot-page'
        snapshotTreeRevision: number
      }>(activePage, 'issues.list', { mode: 'start', filter: 'all', limit: 200 })
      await expect(
        runtimeRpc(activePage, 'issues.reparent', {
          mutationId: randomUUID(),
          issueId: rootIssue.id,
          parentId: rootIssue.id,
          index: 0,
          expectedTreeRevision: snapshot.snapshotTreeRevision
        })
      ).rejects.toThrow(/cycle|itself/i)
      await expect(
        runtimeRpc(activePage, 'issues.reparent', {
          mutationId: randomUUID(),
          issueId: rootIssue.id,
          parentId: sshIssue.id,
          index: 0,
          expectedTreeRevision: snapshot.snapshotTreeRevision
        })
      ).rejects.toThrow(/issue_not_found/i)
      expect(
        (await listIssues(activePage)).find((issue) => issue.id === rootIssue.id)?.parentId
      ).toBeNull()
      expect(
        (await listIssues(activePage, `ssh:${sshTargetId}`)).find(
          (issue) => issue.id === sshIssue.id
        )?.parentId
      ).toBeNull()
      await activePage.getByRole('button', { name: 'Move Issue' }).click()
      const moveDialog = activePage.getByRole('dialog', { name: 'Move Issue' })
      await expect(moveDialog).not.toContainText(issueTitle(grandchild))
      await expect(moveDialog).not.toContainText('Journey SSH Issue')
      await moveDialog.getByRole('button', { name: 'Cancel' }).click()
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '03-three-level-hierarchy.png')
    })

    await test.step('4. Issue 启动、可信 hook 附着与 forget', async () => {
      const activePage = currentPage()
      firstConversation = await launchConversationFromIssue(
        activePage,
        rootIssue.id,
        primaryWorktreeLabel
      )
      firstConversation = await waitForConversation(
        activePage,
        (conversation) =>
          conversation.id === firstConversation.id && conversation.attachment.kind === 'attached'
      )
      await expect.poll(() => listRounds(activePage, rootIssue.id)).not.toHaveLength(0)

      let disposable = await launchConversationFromIssue(
        activePage,
        rootIssue.id,
        primaryWorktreeLabel
      )
      disposable = await waitForConversation(
        activePage,
        (conversation) =>
          conversation.id === disposable.id && conversation.attachment.kind === 'attached'
      )

      await refreshIssueDetail(activePage, rootIssue.id)
      await activePage
        .locator(`[data-conversation-id="${disposable.id}"]`)
        .getByRole('button', { name: 'Forget Conversation' })
        .click()
      await expect(activePage.getByText(/Cannot forget:.*attached/)).toBeVisible()

      const providerSessionId = readConversationProviderSessionId(
        journey.issueDatabasePath(PROFILE_A),
        disposable.id
      )
      const transcriptPath = journey.seedCodexTranscript(providerSessionId, primaryWorktreePath)
      await closeConversationPane(activePage, disposable)
      disposable = await waitForConversation(
        activePage,
        (conversation) =>
          conversation.id === disposable.id && conversation.attachment.kind === 'detached'
      )
      await refreshIssueDetail(activePage, rootIssue.id)
      activePage.once('dialog', (dialog) => void dialog.accept())
      await activePage
        .locator(`[data-conversation-id="${disposable.id}"]`)
        .getByRole('button', { name: 'Forget Conversation' })
        .click()
      await expect
        .poll(async () =>
          (await listConversations(activePage)).some((item) => item.id === disposable.id)
        )
        .toBe(false)
      await expect(activePage.locator(`[data-conversation-id="${disposable.id}"]`)).toHaveCount(0, {
        timeout: 20_000
      })
      await openWorkspacesMode(activePage)
      await expect(activePage.locator(`[data-conversation-id="${disposable.id}"]`)).toHaveCount(0, {
        timeout: 20_000
      })
      await openIssuesMode(activePage)
      expect(existsSync(transcriptPath)).toBe(true)
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '04-launch-and-forget.png')
    })

    await test.step('5. folder Workspace 可信 hook 物化与无 hook terminal 不物化', async () => {
      const activePage = currentPage()
      const folderPath = path.join(journey.userDataDir, 'folder-workspace')
      mkdirSync(folderPath, { recursive: true })
      const folder = await createFolderWorkspaceAndActivate(activePage, folderPath)
      folderWorkspaceId = folder.id
      await openWorkspacesMode(activePage)
      folderConversation = await launchOrdinaryFolderConversation(activePage)
      expect(folderConversation.workspaceRef).toEqual({
        type: 'folder',
        folderWorkspaceId: folder.id
      })
      const conversationCount = (await listConversations(activePage)).length
      const tabCount = await activePage.locator('[data-testid="sortable-tab"]').count()
      await activePage.getByRole('button', { name: 'New tab' }).click({ force: true })
      await activePage.getByRole('menuitem', { name: /New Terminal/i }).click()
      await expect(activePage.locator('[data-testid="sortable-tab"]')).toHaveCount(tabCount + 1)
      await activePage.waitForTimeout(1_000)
      expect(await listConversations(activePage)).toHaveLength(conversationCount)
      await captureJourneyScreenshot(
        activePage,
        SCREENSHOT_DIR,
        '05-folder-hook-materialization.png'
      )
    })

    await test.step('6. Workspaces 与 Issues 核对同一 Conversation DOM 状态', async () => {
      const activePage = currentPage()
      firstConversation = await renameAndCompareConversationRows(
        activePage,
        rootIssue.id,
        firstConversation
      )
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '06-shared-conversation-row.png')
    })

    await test.step('7. bind、rebind、unbind 与跨主机/stale 原子拒绝', async () => {
      const activePage = currentPage()
      const originalWorkspaceRef = folderConversation.workspaceRef
      folderConversation = await bindConversationFromIssueDetail(
        activePage,
        rootIssue.id,
        folderConversation,
        'Issues Journey Folder'
      )
      const boundPane = folderConversation.navigation?.paneKey
        ? parsePaneKey(folderConversation.navigation.paneKey)
        : null
      if (!boundPane) {
        throw new Error('Bound existing Conversation lost its live pane.')
      }
      await activePage
        .getByRole('heading', { name: 'Direct Conversations' })
        .locator('..')
        .locator(`[data-conversation-id="${folderConversation.id}"]`)
        .getByTestId('issue-conversation-workspace-row')
        .locator('.worktree-agent-row-hover')
        .click()
      await expect(activePage.getByRole('button', { name: 'Close Issue detail' })).toBeHidden()
      await expect
        .poll(() => activePage.evaluate(() => window.__store?.getState().activeTabId))
        .toBe(boundPane.tabId)

      await refreshIssueDetail(activePage, rootIssue.id)
      const rebound = await updateConversationIssueFromIssueRow(
        activePage,
        folderConversation,
        externalIssue.id,
        '#4242'
      )
      await expect(
        runtimeRpc(activePage, 'conversations.bindIssue', {
          mutationId: randomUUID(),
          conversationId: rebound.id,
          issueId: rootIssue.id,
          expectedRecordRevision: folderConversation.recordRevision
        })
      ).rejects.toThrow(/changed before this mutation/i)
      await expect(
        runtimeRpc(activePage, 'conversations.bindIssue', {
          mutationId: randomUUID(),
          conversationId: rebound.id,
          issueId: sshIssue.id,
          expectedRecordRevision: rebound.recordRevision
        })
      ).rejects.toThrow(/issue_not_found/i)
      expect(
        (await listConversations(activePage)).find((item) => item.id === rebound.id)?.issueId
      ).toBe(externalIssue.id)

      await refreshIssueDetail(activePage, externalIssue.id)
      folderConversation = await updateConversationIssueFromIssueRow(activePage, rebound, null)
      expect(folderConversation.workspaceRef).toEqual(originalWorkspaceRef)
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '07-bind-rebind-unbind.png')
    })

    await test.step('8. 关闭 pane 后持久 Conversation 只在 Issues 保持 detached', async () => {
      const activePage = currentPage()
      await closeConversationPane(activePage, folderConversation)
      folderConversation = await waitForConversation(
        activePage,
        (conversation) =>
          conversation.id === folderConversation.id && conversation.attachment.kind === 'detached'
      )
      await openIssuesMode(activePage)
      const unassigned = activePage.getByRole('button', { name: /Unassigned/ }).first()
      await expect(unassigned).toBeVisible()
      if ((await unassigned.getAttribute('aria-expanded')) !== 'true') {
        await unassigned.click()
      }
      await expect(
        activePage.locator(`[data-conversation-id="${folderConversation.id}"]`)
      ).toHaveAttribute('data-attachment-state', 'detached')
      await openWorkspacesMode(activePage)
      await expect(activePage.locator('[data-workspace-conversation-rows]')).toHaveCount(0)
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '08-detached-persists.png')
    })

    await test.step('9. Issue 一键恢复与原 Session History Resume 共用同一 Conversation', async () => {
      const activePage = currentPage()
      folderProviderSessionId = readConversationProviderSessionId(
        journey.issueDatabasePath(PROFILE_A),
        folderConversation.id
      )
      journey.seedCodexTranscript(
        folderProviderSessionId,
        folderConversation.workspaceSnapshot.path
      )
      const beforeIds = (await listConversations(activePage)).map((conversation) => conversation.id)

      folderConversation = await resumeUnassignedConversationFromIssuesSidebar(
        activePage,
        folderConversation
      )
      expect(
        (await listConversations(activePage)).map((conversation) => conversation.id).sort()
      ).toEqual([...beforeIds].sort())
      await closeConversationPane(activePage, folderConversation)
      folderConversation = await waitForConversation(
        activePage,
        (conversation) =>
          conversation.id === folderConversation.id && conversation.attachment.kind === 'detached'
      )

      await openSessionHistory(activePage, `folder:${folderWorkspaceId}`)
      await activePage.getByRole('button', { name: 'Refresh Session History' }).click()
      const sessionRow = await findSessionHistoryRow(activePage, folderProviderSessionId)
      await sessionRow.hover()
      await sessionRow.getByTestId('ai-vault-session-resume').click()
      folderConversation = await waitForConversation(
        activePage,
        (conversation) =>
          conversation.id === folderConversation.id && conversation.attachment.kind === 'attached',
        30_000
      )
      await expect(
        activePage.getByText('--- previous session unavailable, started fresh ---', { exact: true })
      ).toHaveCount(0)
      const afterIds = (await listConversations(activePage)).map((conversation) => conversation.id)
      expect([...afterIds].sort()).toEqual([...beforeIds].sort())
      expect(
        readConversationProviderSessionId(
          journey.issueDatabasePath(PROFILE_A),
          folderConversation.id
        )
      ).toBe(folderProviderSessionId)
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '09-resume-same-conversation.png')
      await closeConversationPane(activePage, folderConversation)
      folderConversation = await waitForConversation(
        activePage,
        (conversation) =>
          conversation.id === folderConversation.id && conversation.attachment.kind === 'detached'
      )
    })

    await test.step('10. 另一 worktree Workspace Continue 创建新 provider session 与 conversationId', async () => {
      const activePage = currentPage()
      const beforeIds = new Set(
        (await listConversations(activePage)).map((conversation) => conversation.id)
      )
      await openSessionHistory(activePage, primaryWorktreeId)
      await activePage.getByRole('button', { name: 'Refresh Session History' }).click()
      const sessionRow = await findSessionHistoryRow(activePage, folderProviderSessionId)
      await sessionRow.hover()
      await sessionRow.getByTestId('ai-vault-session-continue-in-new-session').click()
      const dialog = activePage.getByRole('dialog', { name: 'Continue in New Session' })
      const start = dialog.getByRole('button', { name: 'Start New Session' })
      await expect(start).toBeEnabled({ timeout: 20_000 })
      await start.click()
      continuedConversation = await waitForConversation(
        activePage,
        (conversation) =>
          !beforeIds.has(conversation.id) &&
          conversation.workspaceRef.type === 'worktree' &&
          conversation.workspaceRef.worktreeId === primaryWorktreeId,
        30_000
      )
      expect(continuedConversation.id).not.toBe(folderConversation.id)
      const continuedProviderSession = readConversationProviderSessionId(
        journey.issueDatabasePath(PROFILE_A),
        continuedConversation.id
      )
      expect(continuedProviderSession).not.toBe(folderProviderSessionId)
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '10-continue-new-conversation.png')
      if (continuedConversation.attachment.kind === 'attached') {
        await closeConversationPane(activePage, continuedConversation)
        continuedConversation = await waitForConversation(
          activePage,
          (conversation) =>
            conversation.id === continuedConversation.id &&
            conversation.attachment.kind === 'detached'
        )
      }
    })

    await test.step('11. 重启后 Issue、Conversation、Round、read/resolve 持久', async () => {
      const activePage = currentPage()
      await openIssuesMode(activePage)
      await refreshIssueDetail(activePage, rootIssue.id)
      const readButton = activePage.getByRole('button', { name: 'Mark read' }).first()
      if (await readButton.isVisible().catch(() => false)) {
        await readButton.click()
      }
      await expect
        .poll(async () => (await listRounds(activePage, rootIssue.id))[0]?.readAt ?? null)
        .not.toBeNull()
      const beforeResolve = (await listRounds(activePage, rootIssue.id))[0]
      expect(beforeResolve?.resolvedAt).toBeNull()
      const handledButton = activePage.getByRole('button', { name: 'Mark handled' }).first()
      if (await handledButton.isVisible().catch(() => false)) {
        await handledButton.click()
      }
      await expect
        .poll(async () => (await listRounds(activePage, rootIssue.id))[0]?.resolvedAt ?? null)
        .not.toBeNull()
      const persistedRound = (await listRounds(activePage, rootIssue.id))[0]
      firstConversation = await waitForConversation(
        activePage,
        (conversation) =>
          conversation.id === firstConversation.id && conversation.attachment.kind === 'attached',
        30_000
      )
      await close()
      const relaunchedPage = await launch()
      await openIssuesMode(relaunchedPage)
      expect((await listIssues(relaunchedPage)).map((issue) => issue.id)).toEqual(
        expect.arrayContaining([rootIssue.id, externalIssue.id])
      )
      const persistedConversationIds = (await listConversations(relaunchedPage)).map(
        (conversation) => conversation.id
      )
      expect(persistedConversationIds).toEqual(
        expect.arrayContaining([
          firstConversation.id,
          folderConversation.id,
          continuedConversation.id
        ])
      )
      firstConversation = await waitForConversation(
        relaunchedPage,
        (conversation) =>
          conversation.id === firstConversation.id && conversation.attachment.kind === 'attached',
        30_000
      )
      const rounds = await listRounds(relaunchedPage, rootIssue.id)
      const reloadedRound = rounds.find((round) => round.id === persistedRound?.id)
      expect(reloadedRound?.readAt).toBe(persistedRound?.readAt)
      expect(reloadedRound?.resolvedAt).toBe(persistedRound?.resolvedAt)
      await captureJourneyScreenshot(relaunchedPage, SCREENSHOT_DIR, '11-restart-persistence.png')
      await closeConversationPane(relaunchedPage, firstConversation)
      firstConversation = await waitForConversation(
        relaunchedPage,
        (conversation) =>
          conversation.id === firstConversation.id && conversation.attachment.kind === 'detached',
        30_000
      )
    })

    await test.step('12. 切换 profile 后 Issue facts 互不可见', async () => {
      const activePage = currentPage()
      const profiles = await activePage.evaluate(async () => {
        const b = await window.api.orcaProfiles.createLocal({ name: 'Journey Profile B' })
        const c = await window.api.orcaProfiles.createLocal({ name: 'Journey Profile C' })
        return { b: b.profile.id, c: c.profile.id }
      })
      profileB = profiles.b
      profileC = profiles.c
      journey.setProfileSettings(profileB, { agentStatusHooksEnabled: true })
      journey.setProfileSettings(profileC, { agentStatusHooksEnabled: true })
      const copied = await transferProject(activePage, {
        sourceProfileId: PROFILE_A,
        targetProfileId: profileB,
        repoId,
        mode: 'copy'
      })
      expect(copied.status).toBe('transferred')
      await close()
      journey.setActiveProfile(profileB)
      const profileBPage = await launch()
      await openIssuesMode(profileBPage)
      expect(await listIssues(profileBPage)).toHaveLength(0)
      await expect(profileBPage.getByText('Journey root Issue', { exact: true })).toBeHidden()
      expect(
        await profileBPage.evaluate(() => window.__store?.getState().repos.length ?? 0)
      ).toBeGreaterThan(0)
      await captureJourneyScreenshot(profileBPage, SCREENSHOT_DIR, '12-profile-isolation.png')
    })

    await test.step('13. 区分 degraded 与 unavailable 动作', async () => {
      await close()
      journey.setProfileSettings(PROFILE_A, { agentStatusHooksEnabled: false })
      journey.setActiveProfile(PROFILE_A)
      const degradedPage = await launch()
      await openIssuesMode(degradedPage)
      await expect(runtimeRpc(degradedPage, 'issues.status', {})).resolves.toMatchObject({
        status: 'degraded',
        storage: 'ready',
        hookEvidence: 'disabled',
        reason: 'hook-disabled'
      })
      await expect(localIssuesRegion(degradedPage)).toContainText(
        'Hook evidence is disabled; Issue CRUD remains available'
      )
      await degradedPage.getByRole('button', { name: 'Create Issue', exact: true }).click()
      const degradedDialog = degradedPage.getByRole('dialog', { name: 'Create Issue' })
      await degradedDialog.getByLabel('Title').fill('Degraded CRUD remains available')
      await expect(
        degradedDialog.getByRole('button', { name: 'Create', exact: true })
      ).toBeEnabled()
      await degradedDialog.getByRole('button', { name: 'Cancel' }).click()
      await captureJourneyScreenshot(degradedPage, SCREENSHOT_DIR, '13a-hook-degraded.png')

      await close()
      journey.setActiveProfile(profileC)
      journey.makeIssueDatabaseUnavailable(profileC)
      const unavailablePage = await launch()
      await openIssuesMode(unavailablePage)
      await expect(unavailablePage.getByText('Issue storage is unavailable')).toBeVisible()
      await unavailablePage.getByRole('button', { name: 'Create Issue', exact: true }).click()
      const unavailableDialog = unavailablePage.getByRole('dialog', { name: 'Create Issue' })
      await unavailableDialog.getByLabel('Title').fill('Unavailable mutation')
      await expect(
        unavailableDialog.getByRole('button', { name: 'Create', exact: true })
      ).toBeDisabled()
      await unavailableDialog.getByRole('button', { name: 'Cancel' }).click()

      await captureJourneyScreenshot(unavailablePage, SCREENSHOT_DIR, '13b-storage-unavailable.png')
    })

    await test.step('14. Project transfer 沿用 main，Issue 不介入 move', async () => {
      await close()
      journey.setActiveProfile(profileB)
      const activePage = await launch()
      const moved = await transferProject(activePage, {
        sourceProfileId: PROFILE_A,
        targetProfileId: profileC,
        repoId,
        mode: 'move'
      })
      expect(moved.status).toBe('transferred')
      expect(await listIssues(activePage)).toHaveLength(0)
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '14-project-transfer-main.png')
    })

    await test.step('15. local/SSH 独立树与 profile label', async () => {
      const activePage = currentPage()
      await openIssuesMode(activePage)
      const localCreated = await runtimeRpc<{ issue: IssueSummary }>(activePage, 'issues.create', {
        mutationId: randomUUID(),
        source: { kind: 'local', title: 'Profile B local Issue' }
      })
      sshTargetId = await ensureJourneySshTarget(activePage)
      const sshCreated = await runtimeRpc<{ issue: IssueSummary }>(
        activePage,
        'issues.create',
        { mutationId: randomUUID(), source: { kind: 'local', title: 'Profile B SSH Issue' } },
        `ssh:${sshTargetId}`
      )
      await expect
        .poll(async () =>
          (await listIssues(activePage)).some((issue) => issue.id === localCreated.issue.id)
        )
        .toBe(true)
      await expect
        .poll(async () =>
          (await listIssues(activePage, `ssh:${sshTargetId}`)).some(
            (issue) => issue.id === sshCreated.issue.id
          )
        )
        .toBe(true)
      const issuesRegion = localIssuesRegion(activePage)
      await expect(issuesRegion).toContainText('Profile B SSH Issue')
      await expect(issuesRegion).toContainText('Journey SSH')
      await openIssueDetail(activePage, localCreated.issue.id)
      await expect(activePage.getByText('Journey Profile B', { exact: true })).toBeVisible()
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '15-all-host-authority-trees.png')
    })

    await test.step('16. Activity、Dashboard、通知与移动端无新增 Issue 行为', async () => {
      const activePage = currentPage()
      await activePage.evaluate(async () => {
        const store = window.__store
        if (!store) {
          throw new Error('E2E store unavailable')
        }
        await store.getState().updateSettings({
          experimentalActivity: true,
          experimentalAgentDashboardPopout: true,
          experimentalAgentDashboardMode: 'in-window'
        })
        store.getState().openActivityPage()
      })
      await expect(activePage.getByPlaceholder('Filter...')).toBeVisible()
      await expect(activePage.locator('[data-issue-id], [data-conversation-id]')).toHaveCount(0)
      await expect(activePage.getByText('Profile B local Issue', { exact: true })).toBeHidden()
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '16a-activity-without-issues.png')
      await activePage.evaluate(() => window.__store?.getState().closeActivityPage())
      const dashboardButton = activePage.getByRole('button', { name: /Agent Dashboard/ })
      await expect(dashboardButton).toBeVisible()
      await dashboardButton.click()
      const dashboard = activePage.getByRole('dialog', { name: 'Agents' })
      await expect(dashboard).toBeVisible()
      await expect(dashboard.locator('[data-issue-id], [data-conversation-id]')).toHaveCount(0)
      await expect(activePage.getByText(/Issue notification|Mobile Issues/i)).toHaveCount(0)
      await captureJourneyScreenshot(activePage, SCREENSHOT_DIR, '16b-dashboard-without-issues.png')
    })
  } finally {
    await close().catch(() => undefined)
    await journey.dispose()
  }
})

async function findSessionHistoryRow(page: Page, sessionId: string) {
  await page.getByPlaceholder('Search sessions').fill(sessionId)
  const metadata = page.getByTestId('ai-vault-session-metadata')
  await expect(metadata).toHaveCount(1, { timeout: 30_000 })
  return metadata.locator('..')
}
