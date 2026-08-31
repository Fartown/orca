import { expect, type Page } from '@stablyai/playwright-test'
import type { ConversationSummary } from '../../../src/shared/issues/types'
import { refreshIssueDetail, waitForConversation } from './issues-journey-actions'

export async function bindConversationFromIssueDetail(
  page: Page,
  issueId: string,
  conversation: ConversationSummary,
  search: string
): Promise<ConversationSummary> {
  await refreshIssueDetail(page, issueId)
  await page.getByTestId('issue-add-conversation-trigger').click()
  const picker = page.getByTestId('issue-conversation-binding-popover')
  await expect(picker).toBeVisible()
  await picker.getByPlaceholder('Search Conversations…').fill(search)
  const option = picker.locator(`[data-conversation-binding-option="${conversation.id}"]`)
  await expect(option).toBeVisible({ timeout: 20_000 })
  await option.click()
  return waitForConversation(
    page,
    (candidate) => candidate.id === conversation.id && candidate.issueId === issueId
  )
}

export async function updateConversationIssueFromIssueRow(
  page: Page,
  conversation: ConversationSummary,
  issueId: string | null,
  search = ''
): Promise<ConversationSummary> {
  const row = page
    .getByRole('heading', { name: 'Direct Conversations' })
    .locator('..')
    .locator(`[data-conversation-id=${JSON.stringify(conversation.id)}]`)
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.hover()
  await row.getByTestId('conversation-issue-binding-trigger').click()
  const picker = page.getByTestId('conversation-issue-binding-popover')
  await expect(picker).toBeVisible()
  if (issueId === null) {
    await picker.getByTestId('conversation-issue-unbind').click()
  } else {
    await picker.getByPlaceholder('Search Issues…').fill(search)
    const option = picker.locator(`[data-issue-binding-option="${issueId}"]`)
    await expect(option).toBeVisible({ timeout: 20_000 })
    await option.click()
  }
  return waitForConversation(
    page,
    (candidate) => candidate.id === conversation.id && candidate.issueId === issueId
  )
}
