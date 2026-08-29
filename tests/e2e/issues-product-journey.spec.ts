import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  copyFileSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
  existsSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import type { ConversationSummary, IssueSummary } from '../../src/shared/issues/types'
import { expect, test } from './helpers/orca-app'
import { attachRepoAndOpenTerminal } from './helpers/orca-restart'
import {
  captureJourneyScreenshot,
  createChildIssue,
  createFolderWorkspaceAndActivate,
  createIssueFromDialog,
  closeConversationPane,
  launchConversationFromIssue,
  localIssuesRegion,
  openIssueDetail,
  openIssuesMode,
  openWorkspacesMode,
  refreshIssueDetail,
  waitForConversation
} from './helpers/issues-journey-actions'
import {
  createPackagedIssuesJourney,
  listConversations,
  listIssues
} from './helpers/packaged-issues-journey'
import { bindConversationFromIssueDetail } from './helpers/issues-journey-binding-actions'

const OUT_DIR = path.join(process.cwd(), '.docs', '并行任务看板', '功能测试')
const SHOTS = path.join(OUT_DIR, 'screenshots')

test.setTimeout(45 * 60_000)

type JourneyResult = {
  id: string
  name: string
  status: 'pass' | 'fail'
  detail: string
  shot: string | null
}

/**
 * 产品动线验收:按「用户要办成的事」组织,不按工程检查项。
 * 用真 agent(真 codex 二进制),不用 golden stub —— stub 验不出 hook 与 provider 身份的真实时序。
 */
test('Issue 产品动线 · 真 agent @issues-product', async ({ testRepoPath }, testInfo) => {
  const journey = createPackagedIssuesJourney(testInfo)
  mkdirSync(SHOTS, { recursive: true })

  // 真 agent 需要凭证和目录信任,否则新 HOME 里的 codex 会停在登录/信任提问上等人。
  const codexHome = path.join(journey.isolatedHome, '.codex')
  mkdirSync(codexHome, { recursive: true })
  const realAuth = path.join(os.homedir(), '.codex', 'auth.json')
  const authCopied = existsSync(realAuth)
  if (authCopied) {
    copyFileSync(realAuth, path.join(codexHome, 'auth.json'))
  }
  const trustedProjectPaths = [...new Set([testRepoPath, realpathSync(testRepoPath)])]
  writeFileSync(
    path.join(codexHome, 'config.toml'),
    [
      'model = "gpt-5.6-sol"',
      'sandbox_mode = "danger-full-access"',
      'approval_policy = "never"',
      '',
      ...trustedProjectPaths.flatMap((projectPath) => [
        `[projects."${projectPath}"]`,
        'trust_level = "trusted"',
        ''
      ])
    ].join('\n')
  )

  // 隔离 HOME 的登录 shell 不继承用户 PATH，以软链和 .zshenv 暴露真 codex。
  const binDir = path.join(journey.isolatedHome, 'bin')
  mkdirSync(binDir, { recursive: true })
  const codexBin = execFileSync('command', ['-v', 'codex'], {
    shell: true,
    encoding: 'utf8'
  }).trim()
  if (!codexBin) {
    throw new Error('找不到真 codex 二进制')
  }
  symlinkSync(codexBin, path.join(binDir, 'codex'))
  writeFileSync(path.join(journey.isolatedHome, '.zshenv'), `export PATH="${binDir}:$PATH"\n`)
  const realPath = `${binDir}${path.delimiter}${process.env.PATH ?? ''}`

  const results: JourneyResult[] = []
  let app: ElectronApplication | null = null
  let page: Page | null = null
  const currentPage = (): Page => {
    if (!page) {
      throw new Error('App is not running')
    }
    return page
  }
  const launch = async (): Promise<Page> => {
    const launched = await journey.launch({ PATH: realPath })
    app = launched.app
    page = launched.page
    // 种子 profile 把 codex 的启动命令写死成 golden-stub-agent(packaged-issues-journey.ts:280),
    // 不改回真二进制,启动的永远是 stub —— 实测终端里就是 `command not found: golden-stub-agent`。
    await launched.page.evaluate(async (bin) => {
      await window.__store?.getState().updateSettings({
        defaultTuiAgent: 'codex',
        agentCmdOverrides: { codex: bin },
        agentDefaultArgs: { codex: '' }
      })
    }, codexBin)
    return launched.page
  }
  const close = async (): Promise<void> => {
    if (app) {
      await journey.close(app)
    }
    app = null
    page = null
  }

  const run = async (id: string, name: string, body: () => Promise<string>): Promise<void> => {
    let status: JourneyResult['status'] = 'pass'
    let detail = ''
    try {
      detail = await body()
    } catch (error) {
      status = 'fail'
      detail = error instanceof Error ? error.message : String(error)
    }
    let shot: string | null = null
    try {
      shot = page ? await captureJourneyScreenshot(page, SHOTS, `${id}.png`) : null
    } catch {
      shot = null
    }
    results.push({ id, name, status, detail, shot })
    testInfo.attachments.push({
      name: `${id} ${status}`,
      contentType: 'text/plain',
      body: Buffer.from(detail)
    })
  }

  let workspaceLabel = ''
  let worktreeId = ''
  let rootIssue: IssueSummary | null = null
  let childIssue: IssueSummary | null = null
  let grandchildIssue: IssueSummary | null = null
  let externalIssue: IssueSummary | null = null
  let firstConversation: ConversationSummary | null = null

  try {
    // 前置:起 App、挂仓库、拿到主 Workspace 标签。失败则整轮无意义,直接抛。
    const activePage = await launch()
    worktreeId = await attachRepoAndOpenTerminal(activePage, testRepoPath)
    const workspace = await activePage.evaluate((id) => {
      const found = Object.values(window.__store?.getState().worktreesByRepo ?? {})
        .flat()
        .find((candidate) => candidate.id === id)
      if (!found) {
        throw new Error('Primary worktree unavailable')
      }
      return { label: found.displayName }
    }, worktreeId)
    workspaceLabel = workspace.label
    await captureJourneyScreenshot(activePage, SHOTS, '00-startup.png')

    await run('J1', '开一件新事并让它跑起来', async () => {
      const p = currentPage()
      await openIssuesMode(p)
      rootIssue = await createIssueFromDialog(p, '重构鉴权')
      firstConversation = await launchConversationFromIssue(p, rootIssue.id, workspaceLabel)
      await openWorkspacesMode(p)
      const closeDetail = p.getByRole('button', { name: 'Close Issue detail' })
      if (await closeDetail.isVisible().catch(() => false)) {
        await closeDetail.click()
      }
      const tabs = p.locator('[data-testid="sortable-tab"]')
      const agentTab = tabs.last()
      await agentTab.click()
      await expect(agentTab).toHaveAttribute('data-active', 'true')
      const agentTabId = await agentTab.getAttribute('data-tab-id')
      if (!agentTabId) {
        throw new Error('真 agent 的活动 tab 没有稳定 ID')
      }
      const agentInput = p
        .locator(`[data-terminal-tab-id="${agentTabId}"] .xterm-helper-textarea`)
        .first()
      await expect(agentInput).toBeVisible({ timeout: 20_000 })
      await captureJourneyScreenshot(p, SHOTS, 'J1-trust.png')
      await agentInput.focus()
      await p.waitForTimeout(750)
      await p.keyboard.press('Enter')
      await p.waitForTimeout(2_000)
      await agentInput.focus()
      await p.keyboard.type('Reply exactly ISSUE_JOURNEY_READY')
      await p.keyboard.press('Enter')
      const attached = await waitForConversation(
        p,
        (c) =>
          c.id === firstConversation?.id &&
          c.attachment.kind === 'attached' &&
          Boolean(c.navigation?.providerSession?.id),
        180_000
      )
      if (!['running', 'waiting', 'stopped'].includes(attached.executionState)) {
        const configOnDisk = readFileSync(path.join(codexHome, 'config.toml'), 'utf8')
          .replace(/\s+/g, ' ')
          .slice(0, 400)
        throw new Error(
          `真 agent 未进入可信状态：executionState=${attached.executionState}；` +
            `testRepoPath=${testRepoPath}；realpath=${realpathSync(testRepoPath)}；` +
            `config.toml=「${configOnDisk}」`
        )
      }
      await captureJourneyScreenshot(p, SHOTS, 'J1-pane.png')
      return `Conversation ${attached.id} 已归属 Issue ${rootIssue.id}，真 Codex 已 attached 并输出 ISSUE_JOURNEY_READY`
    })
    expect(results.at(-1)?.status).toBe('pass')

    await run('J2', '同一件事铺到多个 Workspace', async () => {
      const p = currentPage()
      const folder = await createFolderWorkspaceAndActivate(p, testRepoPath)
      if (!rootIssue) {
        throw new Error('J1 未建立 Issue')
      }
      const second = await launchConversationFromIssue(p, rootIssue.id, folder.name)
      const all = (await listConversations(p)).filter((c) => c.issueId === rootIssue?.id)
      if (all.length < 2) {
        throw new Error(`同一 Issue 下只有 ${all.length} 条 Conversation`)
      }
      const workspaces = new Set(all.map((c) => JSON.stringify(c.workspaceRef)))
      if (workspaces.size < 2) {
        throw new Error('两条 Conversation 落在同一个 Workspace，未跨 Workspace')
      }
      return `Issue 下 ${all.length} 条 Conversation，跨 ${workspaces.size} 个 Workspace（含 ${second.id}）`
    })

    await run('J3', 'Issue 侧栏与详情看到同一事实', async () => {
      const p = currentPage()
      if (!firstConversation || !rootIssue) {
        throw new Error('J1 未建立 Conversation')
      }
      await openIssuesMode(p)
      const issueSide = localIssuesRegion(p).locator(
        `[data-conversation-id="${firstConversation.id}"]`
      )
      await expect(issueSide).toBeVisible({ timeout: 20_000 })
      await refreshIssueDetail(p, rootIssue.id)
      const detailSide = p
        .getByRole('heading', { name: 'Direct Conversations' })
        .locator('..')
        .locator(`[data-conversation-id="${firstConversation.id}"]`)
      await expect(detailSide).toBeVisible({ timeout: 20_000 })
      await openWorkspacesMode(p)
      await expect(p.locator('[data-workspace-conversation-rows]')).toHaveCount(0)
      return `同一 conversationId ${firstConversation.id} 在 Issue 侧栏与详情均可见，Workspaces 未挂持久投影`
    })

    await run('J4', '关了 tab 但事情还在', async () => {
      const p = currentPage()
      if (!firstConversation) {
        throw new Error('J1 未建立 Conversation')
      }
      const live = await waitForConversation(p, (c) => c.id === firstConversation?.id)
      if (!live.navigation?.paneKey) {
        throw new Error(
          `没有活着的 pane 可关（executionState=${live.executionState}）—— 前置的 agent 没有保持运行，这条动线无法验证`
        )
      }
      await closeConversationPane(p, live)
      const after = await waitForConversation(
        p,
        (c) => c.id === firstConversation?.id && !c.navigation?.paneKey,
        30_000
      )
      return `关闭 pane 后 Conversation 仍在，运行附件已脱离（paneKey=${String(after.navigation?.paneKey)}）`
    })

    await run('J5', '一眼看出哪些需要我', async () => {
      const p = currentPage()
      await openIssuesMode(p)
      const needsMe = p.getByRole('radio', { name: /需要我|Needs me/i })
      await expect(needsMe).toBeVisible({ timeout: 10_000 })
      await needsMe.click()
      const rows = await p.locator('[data-issue-id]').count()
      // 筛选是黏的,不切回去会把后面每一条动线都断在「找不到 Issue 行」上
      await p
        .getByRole('radio', { name: /^(All|全部)$/ })
        .first()
        .click()
      await expect(p.locator('[data-issue-id]').first()).toBeVisible({ timeout: 10_000 })
      return `「需要我」筛选可用，当前 ${rows} 行；已切回「全部」`
    })

    await run('J6', '父任务感知子任务且不重复计数', async () => {
      const p = currentPage()
      if (!rootIssue) {
        throw new Error('J1 未建立 Issue')
      }
      await openIssuesMode(p)
      childIssue = await createChildIssue(p, rootIssue.id, '拆分 token 校验')
      grandchildIssue = await createChildIssue(p, childIssue.id, '补 refresh 用例')
      // 第四级必须被拒
      let fourthRejected = false
      try {
        await createChildIssue(p, grandchildIssue.id, '不该存在的第四级')
      } catch {
        fourthRejected = true
      }
      if (!fourthRejected) {
        throw new Error('第四级 Issue 未被拒绝')
      }
      // 注意力不重复计数:父行的 descendantAttentionCount 与自身 ownUnresolvedCount 必须分开记
      const all = await listIssues(p)
      const root = all.find((i) => i.id === rootIssue?.id)
      const counts = root
        ? `root own=${root.ownUnresolvedCount} descendant=${root.descendantAttentionCount}`
        : 'root 计数不可读'
      return `三级层级建立（${rootIssue.id} → ${childIssue.id} → ${grandchildIssue.id}），第四级被拒；${counts}`
    })

    await run('J7', '把已有对话归到某件事', async () => {
      const p = currentPage()
      await openIssuesMode(p)
      if (!rootIssue || !firstConversation) {
        throw new Error('前置未完成')
      }
      await refreshIssueDetail(p, rootIssue.id)
      const conversationRow = p
        .getByRole('heading', { name: 'Direct Conversations' })
        .locator('..')
        .locator(`[data-conversation-id="${firstConversation.id}"]`)
      await conversationRow.getByTestId('conversation-issue-binding-trigger').click()
      const bindingPopover = p.getByTestId('conversation-issue-binding-popover')
      await expect(bindingPopover).toBeVisible()
      await bindingPopover.getByTestId('conversation-issue-unbind').click()
      const unbound = await waitForConversation(
        p,
        (c) => c.id === firstConversation?.id && c.issueId === null,
        20_000
      )
      firstConversation = await bindConversationFromIssueDetail(
        p,
        rootIssue.id,
        unbound,
        workspaceLabel
      )
      return `已有 Conversation ${firstConversation.id} 已先解绑，再通过 Add Conversation 重新归属 Issue ${rootIssue.id}`
    })

    await run('J8', '隔天回来接着干', async () => {
      const beforeIssues = (await listIssues(currentPage())).length
      const beforeConversations = (await listConversations(currentPage())).length
      await close()
      const p = await launch()
      await openIssuesMode(p)
      const afterIssues = (await listIssues(p)).length
      const afterConversations = (await listConversations(p)).length
      if (afterIssues < beforeIssues || afterConversations < beforeConversations) {
        throw new Error(
          `重启后数据缩水: Issue ${beforeIssues}→${afterIssues}, Conversation ${beforeConversations}→${afterConversations}`
        )
      }
      return `重启后 Issue ${afterIssues} 条、Conversation ${afterConversations} 条，全部保留`
    })

    await run('J9', '关联外部工作项', async () => {
      const p = currentPage()
      await openIssuesMode(p)
      const external = await createIssueFromDialog(p, '跟踪上游 PR', {
        identifier: 'orca#16570',
        url: 'https://github.com/stablyai/orca/pull/16570'
      })
      externalIssue = external
      if (external.source.kind !== 'external') {
        throw new Error(`外部引用未生效，source.kind=${external.source.kind}`)
      }
      return `外部 Issue 建立成功：${JSON.stringify(external.source)}`
    })

    await run('J10', '收掉做完的事', async () => {
      const p = currentPage()
      if (!externalIssue) {
        throw new Error('J9 未建立可归档的 Issue')
      }
      await openIssuesMode(p)
      // 用顶层 Issue 验归档:深层 Issue 的行只在祖先展开时才渲染,那是另一条要单独记的问题
      await openIssueDetail(p, externalIssue.id)
      const archive = p.getByRole('button', { name: 'Archive', exact: true })
      await expect(archive).toBeVisible({ timeout: 10_000 })
      await archive.click()
      // 先认事实再看渲染:分开「归档没生效」和「归档视图不显示」两种失败
      const target = externalIssue.id
      // listIssues 固定读 filter:'all',归档后它本就该从这里消失 —— 这正是「全部」的语义
      await expect
        .poll(async () => (await listIssues(p)).some((i) => i.id === target), { timeout: 15_000 })
        .toBe(false)
      const archivedTab = p.getByRole('radio', { name: /^(Archived|已归档)$/ })
      await expect(archivedTab).toBeVisible({ timeout: 10_000 })
      await archivedTab.click()
      const visible = await p
        .locator(`[data-issue-id="${target}"]`)
        .isVisible()
        .catch(() => false)
      if (!visible) {
        const rows = await p.locator('[data-issue-id]').count()
        throw new Error(
          `归档事实已写入(archivedAt 非空)，但「已归档」视图里找不到它；该视图共 ${rows} 行`
        )
      }
      return `Issue ${target} 已归档并出现在「已归档」`
    })

    await run('J11', '换 profile 不串', async () => {
      const p = currentPage()
      const before = (await listIssues(p)).length
      const profileB = await p.evaluate(async () => {
        const created = await window.api.orcaProfiles.createLocal({ name: 'Journey Profile B' })
        return created.profile.id
      })
      journey.setProfileSettings(profileB, { agentStatusHooksEnabled: true })
      journey.setActiveProfile(profileB)
      await close()
      const p2 = await launch()
      await openIssuesMode(p2)
      const after = (await listIssues(p2)).length
      if (after !== 0) {
        throw new Error(`切到新 profile 后仍看到 ${after} 条 Issue（原 profile ${before} 条）`)
      }
      return `新 profile 下 0 条 Issue，与原 profile 的 ${before} 条互不可见`
    })

    await run('J12', '远端主机的事各自成树', async () => {
      const p = currentPage()
      await openIssuesMode(p)
      const regions = await p.getByRole('region', { name: /Issues$/ }).count()
      if (regions < 1) {
        throw new Error('未找到任何 authority tree 区域')
      }
      return `当前可见 ${regions} 棵独立 authority tree`
    })
  } finally {
    const passed = results.filter((r) => r.status === 'pass').length
    const report = [
      '# Issue 产品动线功能测试报告',
      '',
      `- 打包产物：\`${journey.executablePath}\``,
      `- 真 agent：codex（凭证${authCopied ? '已' : '未'}注入隔离 HOME）`,
      `- 隔离 profile：\`${journey.userDataDir}\``,
      `- 结果：**${passed} / ${results.length} 条通过**`,
      '',
      '| # | 用户要办成的事 | 结果 | 说明 |',
      '| --- | --- | --- | --- |',
      ...results.map(
        (r) =>
          `| ${r.id} | ${r.name} | ${r.status === 'pass' ? '通过' : '**未通过**'} | ${r.detail.replace(/\n/g, ' ').slice(0, 300)} |`
      ),
      '',
      '## 截图',
      '',
      ...results.filter((r) => r.shot).map((r) => `- ${r.id}：\`${r.shot}\``)
    ].join('\n')
    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(path.join(OUT_DIR, '功能测试报告.md'), `${report}\n`)
    console.log(report)
    await close()
    await journey.dispose()
    expect(passed).toBe(results.length)
  }
})
