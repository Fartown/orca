import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Locator } from '@playwright/test'
import { expect, test } from './helpers/orca-app'
import { attachRepoAndOpenTerminal } from './helpers/orca-restart'
import { configureGoldenStubAgent } from './helpers/golden-stub-agent'
import {
  closeConversationPane,
  createIssueFromDialog,
  launchConversationFromIssue,
  openIssueDetail,
  openIssuesMode,
  openWorkspacesMode
} from './helpers/issues-journey-actions'
import { createPackagedIssuesJourney, listConversations } from './helpers/packaged-issues-journey'

const SHOTS = path.join(process.cwd(), '.docs', '并行任务看板', '功能测试', 'ui')

test.setTimeout(12 * 60_000)

/**
 * 盯两件用户直接看得见的事,而不是实现细节:
 *   1. 同一条 Conversation 在 Issues 侧栏与详情使用同一种内容;
 *   2. 行上的名字不是 agent 名 —— 一列全是 "claude" 正是用户报的现象。
 */
test('Issue Conversation 行同形且不显示 agent 名 @row-parity', async ({
  testRepoPath
}, testInfo) => {
  const journey = createPackagedIssuesJourney(testInfo)
  mkdirSync(SHOTS, { recursive: true })
  const transcriptRoot = path.join(journey.isolatedHome, '.codex', 'sessions', '2026', '08', '25')
  const launch = () => journey.launch({ ORCA_E2E_GOLDEN_STUB_TRANSCRIPT_ROOT: transcriptRoot })
  const { app, page } = await launch()

  try {
    const worktreeId = await attachRepoAndOpenTerminal(page, testRepoPath)
    await configureGoldenStubAgent(page)
    const label = await page.evaluate((id) => {
      const found = Object.values(window.__store?.getState().worktreesByRepo ?? {})
        .flat()
        .find((candidate) => candidate.id === id)
      return found?.displayName ?? ''
    }, worktreeId)

    await openIssuesMode(page)
    const issue = await createIssueFromDialog(page, 'Row parity')
    const conversation = await launchConversationFromIssue(page, issue.id, label)
    await expect(page.getByRole('button', { name: 'Close Issue detail' })).toBeHidden()
    await expect
      .poll(() =>
        page.evaluate(() => window.__issueDomainStore?.getState().activeIssueRoute ?? null)
      )
      .toBeNull()

    const attachedConversation = await expect
      .poll(
        async () =>
          (await listConversations(page)).find(
            (item) => item.id === conversation.id && item.attachment.kind === 'attached'
          ) ?? null,
        { timeout: 30_000 }
      )
      .not.toBeNull()
      .then(
        async () => (await listConversations(page)).find((item) => item.id === conversation.id)!
      )
    const paneKey = attachedConversation.navigation?.paneKey
    expect(paneKey).toBeTruthy()
    const issuesLiveRow = page
      .getByRole('region', { name: /Issues$/ })
      .locator(`[data-conversation-id="${conversation.id}"]`)
      .locator(`[data-agent-pane-key="${paneKey}"]`)
    await expect(issuesLiveRow).toBeVisible()
    const issuesLiveSnapshot = await agentRowSnapshot(issuesLiveRow)

    await openWorkspacesMode(page)
    const workspaceLiveRow = page.locator(`[data-agent-pane-key="${paneKey}"]`).first()
    await expect(workspaceLiveRow).toBeVisible()
    expect(await agentRowSnapshot(workspaceLiveRow)).toEqual(issuesLiveSnapshot)
    await closeConversationPane(page, attachedConversation)
    await expect
      .poll(
        async () =>
          (await listConversations(page)).find((item) => item.id === conversation.id)?.attachment
            .kind ?? null,
        { timeout: 30_000 }
      )
      .toBe('detached')
    await openIssuesMode(page)

    // 给这条会话铺一份真实 transcript,让 Orca 的会话历史能算出标题
    const sessionId = await expect
      .poll(
        async () =>
          (await listConversations(page)).find((item) => item.id === conversation.id)?.navigation
            ?.providerSession?.id ?? null,
        { timeout: 30_000 }
      )
      .not.toBeNull()
      .then(
        async () =>
          (await listConversations(page)).find((item) => item.id === conversation.id)?.navigation
            ?.providerSession?.id
      )
    journey.seedCodexTranscript(String(sessionId), testRepoPath)

    await journey.close(app)
    const relaunched = await launch()

    await openIssuesMode(relaunched.page)
    // 详情面板也带 data-conversation-id,必须限定在侧栏的 region 里找,否则匹配到的是那张卡片
    const issuesRow = relaunched.page
      .getByRole('region', { name: /Issues$/ })
      .locator(`[data-conversation-id="${conversation.id}"]`)
    // collapsedIssueIds 默认是空集(即默认展开),点箭头反而会折叠 —— 直接把折叠集清空
    await relaunched.page.evaluate(() =>
      window.__issueDomainStore?.setState({ collapsedIssueIds: new Set() })
    )
    await expect(issuesRow.first()).toBeVisible({ timeout: 30_000 })
    await expect(issuesRow.first()).toContainText(/issues journey resume evidence/i, {
      timeout: 30_000
    })
    const issuesText = (await issuesRow.first().innerText()).replace(/\s+/g, ' ').trim()
    await relaunched.page.screenshot({
      path: path.join(SHOTS, '20-issues-row.png'),
      clip: { x: 0, y: 0, width: 300, height: 620 }
    })

    await openIssueDetail(relaunched.page, issue.id)
    const detailRow = relaunched.page
      .getByRole('heading', { name: 'Direct Conversations' })
      .locator('..')
      .locator(`[data-conversation-id="${conversation.id}"]`)
    await expect(detailRow).toBeVisible()
    await expect(detailRow).toContainText(/issues journey resume evidence/i, { timeout: 30_000 })
    const detailText = (await detailRow.innerText()).replace(/\s+/g, ' ').trim()
    expect(detailText.toLowerCase()).toContain('issues journey resume evidence'.toLowerCase())

    const conversationCountBeforeResume = (await listConversations(relaunched.page)).length
    await detailRow.getByTestId('issue-conversation-primary-action').click()
    const resumedConversation = await expect
      .poll(
        async () =>
          (await listConversations(relaunched.page)).find(
            (item) => item.id === conversation.id && item.attachment.kind === 'attached'
          ) ?? null,
        { timeout: 30_000 }
      )
      .not.toBeNull()
      .then(
        async () =>
          (await listConversations(relaunched.page)).find((item) => item.id === conversation.id)!
      )
    expect((await listConversations(relaunched.page)).length).toBe(conversationCountBeforeResume)
    expect(resumedConversation.id).toBe(conversation.id)
    await expect(
      relaunched.page.locator(`[data-agent-pane-key="${resumedConversation.navigation?.paneKey}"]`)
    ).toBeVisible({ timeout: 30_000 })

    await openWorkspacesMode(relaunched.page)
    const closeDetail = relaunched.page.getByRole('button', { name: 'Close Issue detail' })
    if (await closeDetail.isVisible().catch(() => false)) {
      await closeDetail.click()
    }
    // Workspaces 保持原实现,不得再挂一套持久 Conversation 投影。
    await expect(relaunched.page.locator('[data-workspace-conversation-rows]')).toHaveCount(0)
    await relaunched.page.screenshot({
      path: path.join(SHOTS, '21-workspaces-row.png'),
      clip: { x: 0, y: 0, width: 300, height: 620 }
    })

    console.log(`[issues-row] ${issuesText}`)
    console.log(`[detail-row] ${detailText}`)

    // 名字必须来自会话历史,而不是退成 agent 名
    expect(issuesText, 'Issues 侧的会话行退成了 agent 名').not.toBe('claude')
    expect(issuesText, 'Issues 侧的会话行退成了 agent 名').not.toBe('codex')
    expect(issuesText.toLowerCase()).toContain('issues journey resume evidence'.toLowerCase())

    await journey.close(relaunched.app)
  } finally {
    await journey.dispose()
  }
})

async function agentRowSnapshot(locator: Locator): Promise<{
  text: string
  title: string | null
  focused: string | null
  sendTarget: string | null
}> {
  return locator.evaluate((element) => ({
    text: (element as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
    title: element.getAttribute('title'),
    focused: element.getAttribute('data-focused-agent-pane'),
    sendTarget: element.getAttribute('data-agent-send-target')
  }))
}
