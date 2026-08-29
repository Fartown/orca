import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { configureGoldenStubAgent } from './helpers/golden-stub-agent'
import {
  createIssueFromDialog,
  launchConversationFromIssue,
  openIssuesMode,
  waitForConversation
} from './helpers/issues-journey-actions'
import { setCodexDefaultArgs } from './helpers/issues-journey-maintenance-actions'
import { createPackagedIssuesJourney, listConversations } from './helpers/packaged-issues-journey'
import { attachRepoAndOpenTerminal } from './helpers/orca-restart'

test.setTimeout(12 * 60_000)

test('Issue Conversation retries an unconfirmed launch from the sidebar @unconfirmed-retry', async ({
  testRepoPath
}, testInfo) => {
  const journey = createPackagedIssuesJourney(testInfo)
  const transcriptRoot = path.join(journey.isolatedHome, '.codex', 'sessions', '2026', '08', '29')
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
    const issue = await createIssueFromDialog(page, 'Unconfirmed launch retry')
    await setCodexDefaultArgs(page, "'")
    const allocated = await launchConversationFromIssue(page, issue.id, workspaceLabel)
    const failed = await waitForConversation(
      page,
      (conversation) => conversation.id === allocated.id && conversation.launchFailure !== null
    )
    await setCodexDefaultArgs(page, '')

    await openIssuesMode(page)
    const issuesRegion = page.getByRole('region', { name: /Issues$/ })
    const issueRow = issuesRegion.locator(`[data-issue-id="${issue.id}"]`)
    const issueToggle = issueRow.getByRole('button', { name: /^(Expand|Collapse) Issue$/ })
    if ((await issueToggle.getAttribute('aria-label')) === 'Expand Issue') {
      await issueToggle.click()
    }
    const conversationRow = issuesRegion.locator(`[data-conversation-id="${allocated.id}"]`)
    await expect(conversationRow).toBeVisible()

    await page.evaluate((conversationId) => {
      const store = window.__issueDomainStore
      const state = store?.getState()
      const partition = state?.partitionsByRouteExecutionHostId.local
      const current = partition?.conversationsById[conversationId]
      if (!store || !state || !partition || !current) {
        throw new Error('Issue Conversation projection is unavailable')
      }
      store.setState({
        partitionsByRouteExecutionHostId: {
          ...state.partitionsByRouteExecutionHostId,
          local: {
            ...partition,
            conversationsById: {
              ...partition.conversationsById,
              [conversationId]: {
                ...current,
                attachment: { kind: 'detached' },
                executionState: 'stopped',
                launchFailure: null,
                latestRound: null,
                unresolvedRoundCount: 0,
                resumability: 'unavailable',
                workspaceAvailability: 'available',
                navigation: { paneKey: null, providerSession: null, resumeLocator: null }
              }
            }
          }
        }
      })
    }, allocated.id)

    await expect(conversationRow).toHaveAttribute('data-execution-state', 'stopped')
    await expect(conversationRow.getByRole('button', { name: 'Retry Conversation' })).toBeVisible()
    await expect(conversationRow.getByTestId('issue-conversation-primary-action')).toBeVisible()
    const retryReadyScreenshot = testInfo.outputPath('01-unconfirmed-retry-ready.png')
    await page.screenshot({ path: retryReadyScreenshot, fullPage: true })
    await testInfo.attach('unconfirmed-retry-ready', {
      path: retryReadyScreenshot,
      contentType: 'image/png'
    })

    await setCodexDefaultArgs(page, "'")
    await conversationRow.getByRole('button', { name: 'Retry Conversation' }).click()
    const failedAgain = await waitForConversation(
      page,
      (conversation) =>
        conversation.id === allocated.id &&
        conversation.recordRevision > failed.recordRevision &&
        conversation.launchFailure !== null
    )
    expect(failedAgain.id).toBe(allocated.id)
    await setCodexDefaultArgs(page, '')

    const countBeforeSuccessfulRetry = (await listConversations(page)).length
    await expect(conversationRow.getByTestId('issue-conversation-primary-action')).toBeVisible()
    await conversationRow.getByTestId('issue-conversation-primary-action').click()
    const attached = await waitForConversation(
      page,
      (conversation) =>
        conversation.id === allocated.id && conversation.attachment.kind === 'attached',
      30_000
    )

    expect(attached.id).toBe(allocated.id)
    expect((await listConversations(page)).length).toBe(countBeforeSuccessfulRetry)
    if (!attached.navigation?.paneKey) {
      throw new Error('Retried Conversation did not publish pane navigation')
    }
    await expect(
      page.locator(`[data-agent-pane-key="${attached.navigation.paneKey}"]`).first()
    ).toBeVisible({ timeout: 30_000 })
    const attachedScreenshot = testInfo.outputPath('02-unconfirmed-retry-attached.png')
    await page.screenshot({ path: attachedScreenshot, fullPage: true })
    await testInfo.attach('unconfirmed-retry-attached', {
      path: attachedScreenshot,
      contentType: 'image/png'
    })
  } finally {
    await journey.close(app)
    await journey.dispose()
  }
})
