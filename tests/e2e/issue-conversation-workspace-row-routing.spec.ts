import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { attachRepoAndOpenTerminal } from './helpers/orca-restart'
import { configureGoldenStubAgent } from './helpers/golden-stub-agent'
import { parsePaneKey } from '../../src/shared/stable-pane-id'
import {
  closeConversationPane,
  createIssueFromDialog,
  launchConversationFromIssue,
  openIssueDetail,
  openIssuesMode
} from './helpers/issues-journey-actions'
import { createPackagedIssuesJourney, listConversations } from './helpers/packaged-issues-journey'

test.setTimeout(12 * 60_000)

test('Issue Conversation routes by the exact Workspace row @workspace-row-routing', async ({
  testRepoPath
}, testInfo) => {
  const journey = createPackagedIssuesJourney(testInfo)
  const transcriptRoot = path.join(journey.isolatedHome, '.codex', 'sessions', '2026', '08', '25')
  const { app, page } = await journey.launch({
    ORCA_E2E_GOLDEN_STUB_TRANSCRIPT_ROOT: transcriptRoot
  })

  try {
    const worktreeId = await attachRepoAndOpenTerminal(page, testRepoPath)
    await configureGoldenStubAgent(page)
    const workspaceLabel = await page.evaluate((id) => {
      const worktree = Object.values(window.__store?.getState().worktreesByRepo ?? {})
        .flat()
        .find((candidate) => candidate.id === id)
      return worktree?.displayName ?? ''
    }, worktreeId)

    await openIssuesMode(page)
    const issue = await createIssueFromDialog(page, 'Workspace row routing')
    const allocated = await launchConversationFromIssue(page, issue.id, workspaceLabel)
    const attached = await expect
      .poll(
        async () =>
          (await listConversations(page)).find(
            (conversation) =>
              conversation.id === allocated.id && conversation.attachment.kind === 'attached'
          ) ?? null,
        { timeout: 30_000 }
      )
      .not.toBeNull()
      .then(
        async () =>
          (await listConversations(page)).find((conversation) => conversation.id === allocated.id)!
      )
    const paneKey = attached.navigation?.paneKey
    const providerSessionId = attached.navigation?.providerSession?.id
    if (!paneKey || !providerSessionId) {
      throw new Error('Launched Conversation did not publish pane and provider identities')
    }
    const parsedPaneKey = parsePaneKey(paneKey)
    if (!parsedPaneKey) {
      throw new Error(`Launched Conversation published malformed pane key: ${paneKey}`)
    }
    const tabId = parsedPaneKey.tabId
    const issueRow = page
      .getByRole('region', { name: /Issues$/ })
      .locator(`[data-conversation-id="${attached.id}"]`)

    const nativeIssueRow = issueRow
      .getByTestId('issue-conversation-workspace-row')
      .locator('.worktree-agent-row-hover')
    await expect(nativeIssueRow).toBeVisible()
    await openIssueDetail(page, issue.id)
    await nativeIssueRow.click()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = window.__store?.getState()
          return {
            activeIssueRoute: window.__issueDomainStore?.getState().activeIssueRoute ?? null,
            activeTabId: state?.activeTabId ?? null,
            activeTabType: state?.activeTabType ?? null
          }
        })
      )
      .toEqual({ activeIssueRoute: null, activeTabId: tabId, activeTabType: 'terminal' })
    const nativeFocusScreenshot = testInfo.outputPath('01-native-workspace-row-focus.png')
    await page.screenshot({ path: nativeFocusScreenshot, fullPage: true })
    await testInfo.attach('native-workspace-row-focus', {
      path: nativeFocusScreenshot,
      contentType: 'image/png'
    })

    await page.evaluate((targetConversationId) => {
      const store = window.__issueDomainStore
      const state = store?.getState()
      const partition = state?.partitionsByRouteExecutionHostId.local
      const current = partition?.conversationsById[targetConversationId]
      if (!store || !state || !partition || !current?.navigation?.providerSession) {
        throw new Error('Issue Conversation projection is unavailable for the detached fixture')
      }
      store.setState({
        partitionsByRouteExecutionHostId: {
          ...state.partitionsByRouteExecutionHostId,
          local: {
            ...partition,
            conversationsById: {
              ...partition.conversationsById,
              [targetConversationId]: {
                ...current,
                attachment: { kind: 'detached' },
                executionState: 'stopped',
                navigation: { ...current.navigation, paneKey: null }
              }
            }
          }
        }
      })
    }, attached.id)
    await expect(issueRow).toHaveAttribute('data-attachment-state', 'detached')
    await expect(nativeIssueRow).toBeVisible()
    await expect(issueRow.getByTestId('issue-conversation-primary-action')).toHaveCount(0)
    await openIssueDetail(page, issue.id)
    await nativeIssueRow.click()
    await expect
      .poll(() =>
        page.evaluate(() => ({
          activeIssueRoute: window.__issueDomainStore?.getState().activeIssueRoute ?? null,
          activeTabId: window.__store?.getState().activeTabId ?? null
        }))
      )
      .toEqual({ activeIssueRoute: null, activeTabId: tabId })
    const detachedProjectionScreenshot = testInfo.outputPath('02-detached-navigation-fallback.png')
    await page.screenshot({ path: detachedProjectionScreenshot, fullPage: true })
    await testInfo.attach('detached-projection-workspace-row', {
      path: detachedProjectionScreenshot,
      contentType: 'image/png'
    })

    journey.seedCodexTranscript(providerSessionId, testRepoPath)
    const historyFound = await page.evaluate(
      async ({ workspacePath, sessionId }) => {
        const result = await window.api.aiVault.listSessions({
          force: true,
          unlimited: true,
          scopePaths: [workspacePath],
          executionHostScope: 'local'
        })
        return result.sessions.some(
          (session) =>
            session.executionHostId === 'local' &&
            session.agent === 'codex' &&
            session.sessionId === sessionId
        )
      },
      { workspacePath: testRepoPath, sessionId: providerSessionId }
    )
    expect(historyFound).toBe(true)

    await closeConversationPane(page, attached)
    await openIssuesMode(page)
    await expect
      .poll(
        async () =>
          (await listConversations(page)).find((conversation) => conversation.id === attached.id)
            ?.attachment.kind ?? null,
        { timeout: 30_000 }
      )
      .toBe('detached')
    await expect(issueRow.getByTestId('issue-conversation-workspace-row')).toHaveCount(0)
    const fallback = issueRow.getByTestId('issue-conversation-primary-action')
    await expect(fallback).toBeVisible()
    const fallbackScreenshot = testInfo.outputPath('03-detached-issue-fallback.png')
    await page.screenshot({ path: fallbackScreenshot, fullPage: true })
    await testInfo.attach('detached-issue-fallback', {
      path: fallbackScreenshot,
      contentType: 'image/png'
    })
    const conversationCountBeforeResume = (await listConversations(page)).length
    await fallback.click()

    const resumed = await expect
      .poll(
        async () => {
          const conversation = (await listConversations(page)).find(
            (candidate) => candidate.id === attached.id
          )
          const resumedPaneKey = conversation?.navigation?.paneKey
          return conversation?.attachment.kind === 'attached' && resumedPaneKey !== paneKey
            ? conversation
            : null
        },
        { timeout: 30_000 }
      )
      .not.toBeNull()
      .then(
        async () =>
          (await listConversations(page)).find((conversation) => conversation.id === attached.id)!
      )

    expect((await listConversations(page)).length).toBe(conversationCountBeforeResume)
    expect(resumed.navigation?.paneKey).not.toBe(paneKey)
    const resumedPane = parsePaneKey(resumed.navigation?.paneKey ?? '')
    if (!resumedPane) {
      throw new Error(
        `Resumed Conversation published malformed pane key: ${resumed.navigation?.paneKey}`
      )
    }
    await expect
      .poll(() => page.evaluate(() => window.__store?.getState().activeTabId ?? null))
      .toBe(resumedPane.tabId)
    await openIssuesMode(page)
    await expect(issueRow.getByTestId('issue-conversation-workspace-row')).toBeVisible({
      timeout: 30_000
    })
    const resumedScreenshot = testInfo.outputPath('04-resumed-pane-visible.png')
    await page.screenshot({ path: resumedScreenshot, fullPage: true })
    await testInfo.attach('resumed-pane-visible', {
      path: resumedScreenshot,
      contentType: 'image/png'
    })
  } finally {
    await journey.close(app)
    await journey.dispose()
  }
})
