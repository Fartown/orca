import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@stablyai/playwright-test'
import type { ConversationSummary, IssueSummary } from '../../../src/shared/issues/types'
import { parsePaneKey } from '../../../src/shared/stable-pane-id'
import {
  localIssuesRegion,
  openIssuesMode,
  openWorkspacesMode,
  refreshIssueDetail,
  waitForConversation
} from './issues-journey-actions'
import { listIssues, runtimeRpc } from './packaged-issues-journey'

export async function verifyIssueEditConflict(
  page: Page,
  issue: IssueSummary
): Promise<IssueSummary> {
  await refreshIssueDetail(page, issue.id)
  await runtimeRpc(page, 'issues.update', {
    mutationId: randomUUID(),
    issueId: issue.id,
    expectedRecordRevision: issue.recordRevision,
    title: 'Journey concurrent title'
  })
  await page.getByRole('button', { name: 'Edit Issue' }).click()
  let dialog = page.getByRole('dialog', { name: 'Edit Issue' })
  await dialog.getByLabel('Title').fill('Journey stale title')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(/changed before this mutation/i)).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

  await refreshIssueDetail(page, issue.id)
  await page.getByRole('button', { name: 'Edit Issue' }).click()
  dialog = page.getByRole('dialog', { name: 'Edit Issue' })
  await dialog.getByLabel('Title').fill('Journey root Issue')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(async () => (await listIssues(page)).find((candidate) => candidate.id === issue.id))
    .toMatchObject({ localTitle: 'Journey root Issue', recordRevision: 2 })
  const updated = (await listIssues(page)).find((candidate) => candidate.id === issue.id)
  if (!updated) {
    throw new Error('Edited Issue disappeared from its authority.')
  }
  return updated
}

export async function renameAndCompareConversationRows(
  page: Page,
  issueId: string,
  conversation: ConversationSummary
): Promise<ConversationSummary> {
  await refreshIssueDetail(page, issueId)
  await page.getByRole('button', { name: 'Rename Conversation' }).click()
  const dialog = page.getByRole('dialog', { name: 'Rename Conversation' })
  await dialog.getByLabel('Title').fill('Journey shared title')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toBeHidden()
  const updated = await waitForConversation(
    page,
    (candidate) => candidate.id === conversation.id && candidate.title === 'Journey shared title'
  )

  if (updated.workspaceRef.type !== 'worktree') {
    throw new Error('Shared running-row comparison requires the original worktree Conversation.')
  }
  await openWorkspacesMode(page)
  const workspaceAgentList = page
    .locator(`[data-worktree-id="${updated.workspaceRef.worktreeId}"]`)
    .locator('[aria-label="Agents"]')
    .first()
  await expect(workspaceAgentList).toBeVisible()
  const workspaceText = normalizeRowText(await workspaceAgentList.innerText())

  await openIssuesMode(page)
  const issueRow = localIssuesRegion(page).locator(`[data-conversation-id="${updated.id}"]`)
  await expect(issueRow).toBeVisible()
  const issueAgentList = issueRow.locator('[aria-label="Agents"]')
  await expect(issueAgentList).toBeVisible()
  expect(normalizeRowText(await issueAgentList.innerText())).toBe(workspaceText)
  await expect(issueRow).toHaveAttribute('data-execution-state', updated.executionState)
  await refreshIssueDetail(page, issueId)
  const detailRow = page
    .getByRole('heading', { name: 'Direct Conversations' })
    .locator('..')
    .locator(`[data-conversation-id="${updated.id}"]`)
  await expect(detailRow).toBeVisible()
  const detailAgentList = detailRow.locator('[aria-label="Agents"]')
  await expect(detailAgentList).toBeVisible()
  expect(normalizeRowText(await detailAgentList.innerText())).toBe(workspaceText)
  await expect(detailRow).toHaveAttribute('data-execution-state', updated.executionState)
  if (updated.attachment.kind !== 'attached') {
    throw new Error('Shared running-row comparison lost its Runtime Attachment.')
  }
  const pane = parsePaneKey(updated.attachment.paneKey)
  if (!pane) {
    throw new Error('Shared running-row comparison received an invalid pane key.')
  }
  await detailAgentList.locator('.worktree-agent-row-hover').first().click()
  await expect(page.getByRole('button', { name: 'Close Issue detail' })).toBeHidden()
  await expect
    .poll(() => page.evaluate(() => window.__store?.getState().activeTabId))
    .toBe(pane.tabId)
  await openWorkspacesMode(page)
  await expect(page.locator('[data-workspace-conversation-rows]')).toHaveCount(0)
  return updated
}

function normalizeRowText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
