import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@stablyai/playwright-test'
import type { ConversationSummary, IssueSummary } from '../../../src/shared/issues/types'
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

  await openIssuesMode(page)
  const issueRow = localIssuesRegion(page).locator(`[data-conversation-id="${updated.id}"]`)
  await expect(issueRow).toBeVisible()
  await expect(issueRow).toContainText('Journey shared title')
  await expect(issueRow).toHaveAttribute('data-execution-state', updated.executionState)
  await openWorkspacesMode(page)
  const workspaceRow = page.locator(
    `[data-workspace-conversation-rows] [data-conversation-id="${updated.id}"]`
  )
  await expect(workspaceRow).toBeVisible()
  await expect(workspaceRow).toContainText('Journey shared title')
  await expect(workspaceRow).toHaveAttribute('data-execution-state', updated.executionState)
  return updated
}
