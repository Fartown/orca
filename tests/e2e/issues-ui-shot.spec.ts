import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { attachRepoAndOpenTerminal } from './helpers/orca-restart'
import {
  createChildIssue,
  createIssueFromDialog,
  openIssuesMode,
  openWorkspacesMode
} from './helpers/issues-journey-actions'
import { createPackagedIssuesJourney } from './helpers/packaged-issues-journey'

const SHOTS = path.join(process.cwd(), '.docs', '并行任务看板', '功能测试', 'ui')

test.setTimeout(10 * 60_000)

/** 只为看清侧栏长什么样:裁到侧栏宽度,放大截图,自己比对而不是让人肉眼描述。 */
test('Issues 侧栏外观采样 @issues-ui-shot', async ({ testRepoPath }, testInfo) => {
  const journey = createPackagedIssuesJourney(testInfo)
  mkdirSync(SHOTS, { recursive: true })
  const { app, page } = await journey.launch()
  const sidebar = { x: 0, y: 0, width: 300, height: 620 }
  const shot = async (name: string): Promise<void> => {
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), clip: sidebar })
  }

  try {
    // 空应用里 [data-worktree-sidebar] 还没挂载,先挂仓库再切 Workspaces
    await openIssuesMode(page)
    await shot('01-issues-empty')

    await attachRepoAndOpenTerminal(page, testRepoPath)
    await openWorkspacesMode(page)
    await shot('02-workspaces-with-repo')

    await openIssuesMode(page)
    const root = await createIssueFromDialog(page, 'Refactor auth')
    const child = await createChildIssue(page, root.id, 'Split token validation')
    await createChildIssue(page, child.id, 'Cover refresh path')
    await page.getByRole('button', { name: 'Close Issue detail' }).click()
    await openIssuesMode(page)
    // 侧栏走轮询,RPC 建完 Issue 后 store 还可能停在 loading —— 等行真的渲染出来再截
    await expect(page.locator('[data-issue-id]').first()).toBeVisible({ timeout: 30_000 })
    await shot('04-issues-tree')

    // 主机下拉只在多主机时存在(单主机是噪音),所以这一步是条件性的
    const hostSelect = page.getByRole('combobox')
    if ((await hostSelect.count()) > 0) {
      await hostSelect.last().click()
      await page.screenshot({
        path: path.join(SHOTS, '05-host-select-open.png'),
        clip: { x: 0, y: 0, width: 520, height: 400 }
      })
    }
  } finally {
    await journey.close(app)
    await journey.dispose()
  }
})
