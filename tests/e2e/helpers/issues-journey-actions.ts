import { expect, type Page } from '@stablyai/playwright-test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { ConversationSummary, IssueSummary } from '../../../src/shared/issues/types'
import { parsePaneKey } from '../../../src/shared/stable-pane-id'
import { configureGoldenStubAgent } from './golden-stub-agent'
import { listConversations, listIssues } from './packaged-issues-journey'

export async function captureJourneyScreenshot(
  page: Page,
  directory: string,
  name: string
): Promise<string> {
  mkdirSync(directory, { recursive: true })
  const screenshotPath = path.join(directory, name)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  return screenshotPath
}

export async function openIssuesMode(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Issues', exact: true }).click()
  await expect(localIssuesRegion(page)).toBeVisible({ timeout: 20_000 })
}

export function localIssuesRegion(page: Page) {
  return page.getByRole('region', { name: /^Local (Mac|Linux|Windows) Issues$/ })
}

export async function openWorkspacesMode(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Workspaces', exact: true }).click()
  await expect(page.locator('[data-worktree-sidebar]')).toBeVisible()
}

export async function createIssueFromDialog(
  page: Page,
  title: string,
  external?: { identifier: string; url: string }
): Promise<IssueSummary> {
  await page.getByRole('button', { name: 'Create Issue', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Issue' })
  await expect(dialog).toBeVisible()
  if (external) {
    await dialog.getByLabel('Source').click()
    await page.getByRole('option', { name: 'External reference' }).click()
    await dialog.getByLabel('External identifier').fill(external.identifier)
    await dialog.getByLabel('URL').fill(external.url)
  }
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(async () => (await listIssues(page)).find((issue) => issueTitle(issue) === title) ?? null)
    .not.toBeNull()
  const issue = (await listIssues(page)).find((candidate) => issueTitle(candidate) === title)
  if (!issue) {
    throw new Error(`Created Issue did not appear: ${title}`)
  }
  await expect(page.locator(`[data-issue-id="${issue.id}"]`)).toBeVisible({ timeout: 10_000 })
  return issue
}

export async function openIssueDetail(page: Page, issueId: string): Promise<void> {
  const row = page.locator(`[data-issue-id="${issueId}"]`)
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.locator('button').last().click()
  await expect(page.getByRole('button', { name: 'Close Issue detail' })).toBeVisible()
}

export async function refreshIssueDetail(page: Page, issueId: string): Promise<void> {
  const close = page.getByRole('button', { name: 'Close Issue detail' })
  if (await close.isVisible().catch(() => false)) {
    await close.click()
  }
  await openIssuesMode(page)
  await openIssueDetail(page, issueId)
}

export async function createChildIssue(
  page: Page,
  parentId: string,
  title: string
): Promise<IssueSummary> {
  await refreshIssueDetail(page, parentId)
  await page.getByRole('button', { name: 'Child', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Create child Issue' })
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(async () => (await listIssues(page)).find((issue) => issueTitle(issue) === title) ?? null)
    .not.toBeNull()
  const issue = (await listIssues(page)).find((candidate) => issueTitle(candidate) === title)
  if (!issue) {
    throw new Error(`Created child Issue did not appear: ${title}`)
  }
  return issue
}

export async function launchConversationFromIssue(
  page: Page,
  issueId: string,
  workspaceLabel: string
): Promise<ConversationSummary> {
  const beforeIds = new Set((await listConversations(page)).map((conversation) => conversation.id))
  await refreshIssueDetail(page, issueId)
  await page.getByRole('button', { name: 'New Conversation' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Conversation' })
  const workspaceTrigger = dialog.getByRole('combobox').first()
  await workspaceTrigger.click()
  await page.getByRole('option', { name: workspaceLabel, exact: true }).click()
  await dialog.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(
      async () => {
        const conversations = await listConversations(page)
        return (
          conversations.find(
            (conversation) => conversation.issueId === issueId && !beforeIds.has(conversation.id)
          ) ?? null
        )
      },
      { timeout: 20_000 }
    )
    .not.toBeNull()
  const conversation = (await listConversations(page)).find(
    (candidate) => candidate.issueId === issueId && !beforeIds.has(candidate.id)
  )
  if (!conversation) {
    throw new Error('Issue launch did not allocate a Conversation')
  }
  return conversation
}

export async function waitForConversation(
  page: Page,
  predicate: (conversation: ConversationSummary) => boolean,
  timeout = 20_000
): Promise<ConversationSummary> {
  try {
    await expect
      .poll(async () => (await listConversations(page)).find(predicate) ?? null, { timeout })
      .not.toBeNull()
  } catch (error) {
    const observed = await listConversations(page)
    throw new Error(
      `Conversation wait timed out; observed=${JSON.stringify(observed)}; cause=${String(error)}`
    )
  }
  const conversation = (await listConversations(page)).find(predicate)
  if (!conversation) {
    throw new Error('Conversation condition was lost after polling')
  }
  return conversation
}

export async function closeConversationPane(
  page: Page,
  conversation: ConversationSummary
): Promise<void> {
  await openWorkspacesMode(page)
  const closeIssueDetail = page.getByRole('button', { name: 'Close Issue detail' })
  if (await closeIssueDetail.isVisible().catch(() => false)) {
    await closeIssueDetail.click()
  }
  const paneKey = conversation.navigation?.paneKey
  const parsed = paneKey ? parsePaneKey(paneKey) : null
  if (!parsed) {
    throw new Error(`Conversation ${conversation.id} has no live pane navigation`)
  }
  const tab = page.locator(`[data-testid="sortable-tab"][data-tab-id="${parsed.tabId}"]`)
  await expect(tab).toBeVisible()
  await tab.hover()
  await tab.locator('[data-tab-close-button="true"]').click()
  const closeDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: 'Stop Agent', exact: true }) })
  const stopAgent = closeDialog.getByRole('button', { name: 'Stop Agent', exact: true })
  const closeOutcome = await Promise.any([
    stopAgent.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'confirmation' as const),
    tab.waitFor({ state: 'hidden', timeout: 10_000 }).then(() => 'closed' as const)
  ])
  if (closeOutcome === 'confirmation') {
    await stopAgent.click()
  }
  await expect(tab).toBeHidden({ timeout: 15_000 })
}

export async function createFolderWorkspaceAndActivate(
  page: Page,
  folderPath: string
): Promise<{ id: string; name: string }> {
  return page.evaluate(async (pathValue) => {
    const group = await window.api.projectGroups.create({
      name: 'Issues Journey Folders',
      parentPath: pathValue
    })
    const workspace = await window.api.folderWorkspaces.create({
      projectGroupId: group.id,
      name: 'Issues Journey Folder',
      folderPath: pathValue
    })
    const store = window.__store
    if (!store) {
      throw new Error('E2E store unavailable')
    }
    await store.getState().fetchProjectGroups()
    await store.getState().fetchFolderWorkspaces()
    store.getState().setActiveFolderWorkspace(workspace.id, 'local')
    return { id: workspace.id, name: workspace.name }
  }, folderPath)
}

export async function launchOrdinaryFolderConversation(page: Page): Promise<ConversationSummary> {
  const closeIssueDetail = page.getByRole('button', { name: 'Close Issue detail' })
  if (await closeIssueDetail.isVisible().catch(() => false)) {
    await closeIssueDetail.click()
  }
  await configureGoldenStubAgent(page)
  const beforeIds = new Set((await listConversations(page)).map((conversation) => conversation.id))
  const beforeTabCount = await page.locator('[data-testid="sortable-tab"]').count()
  await page.getByRole('button', { name: 'New tab' }).click({ force: true })
  const launchOption = page.getByRole('menuitem', { name: /^Codex(?:\s|$)/i }).first()
  await expect(launchOption).toBeVisible({ timeout: 15_000 })
  await launchOption.click({ force: true })
  await expect(page.locator('[data-testid="sortable-tab"]')).toHaveCount(beforeTabCount + 1)
  return waitForConversation(
    page,
    (conversation) => conversation.issueId === null && !beforeIds.has(conversation.id)
  )
}

export async function openSessionHistory(page: Page, workspaceId: string): Promise<void> {
  await page.evaluate((targetWorkspaceId) => {
    const store = window.__store
    if (!store) {
      throw new Error('E2E store unavailable')
    }
    if (targetWorkspaceId.startsWith('folder:')) {
      store.getState().setActiveFolderWorkspace(targetWorkspaceId.slice('folder:'.length), 'local')
    } else {
      store.getState().setActiveWorktree(targetWorkspaceId)
    }
    store.getState().setRightSidebarTab('vault')
    store.getState().setRightSidebarOpen(true)
  }, workspaceId)
  await expect(page.getByText('Agent Session History', { exact: true })).toBeVisible({
    timeout: 20_000
  })
  await page.locator('button').filter({ hasText: /^All$/ }).click()
}

export function issueTitle(issue: IssueSummary): string {
  return issue.source.kind === 'local'
    ? (issue.localTitle ?? 'Untitled Issue')
    : issue.source.titleSnapshot
}
