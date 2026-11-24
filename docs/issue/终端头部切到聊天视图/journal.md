---
title: '终端头部切到聊天视图'
slug: '终端头部切到聊天视图'
status: testing
created: 2026-10-23
updated: 2026-10-23
---

# 终端头部切到聊天视图 开发 Journal

## 1. 关键文档链接

| 类型     | 文档                                                                                     | 状态         | 说明                                  |
| -------- | ---------------------------------------------------------------------------------------- | ------------ | ------------------------------------- |
| 需求     | [requirements/requirement.md](requirements/requirement.md)                               | ready        | REQ-1～REQ-2                          |
| 交互     | -                                                                                        | not-required | 沿用相邻头部按钮的样式与显隐规则      |
| 调研     | -                                                                                        | not-required | 两个同名功能的来源见需求 §1 与方案 §1 |
| 方案     | [solutions/overview.md](solutions/overview.md)                                           | approved     | 新增按钮，两个功能改名区分            |
| 测试用例 | [tests/cases/终端头部切到聊天视图测试.md](tests/cases/终端头部切到聊天视图测试.md)       | ready        | TC-1～TC-4                            |
| 测试记录 | [tests/runs/2026-10-23-本机与SSH真机验证.md](tests/runs/2026-10-23-本机与SSH真机验证.md) | completed    | 本机与 SSH 均通过                     |

## 2. 决策点记录

### D-1 新增按钮而不是替换，两个功能改名区分

- 日期：2026-10-23
- 背景：上游把头部的就地 chat view 按钮换成了新聊天接管，两者文案相同；用户在 agent 运行中点头部按钮总被拒，SSH 工作区里按钮不出现。
- 最终决定：用户选择「新增，不替换」并采用改名区分：就地 chat view 叫「切到聊天视图」，新聊天接管叫「在新聊天中接管」。
- 原因：两个功能都有用；同名是混淆的根源。方向与上游 #27184（把头部就地 chat view 换成新聊天接管）相反，是有意为之，同步上游时不要当成回归删掉。
- 影响范围：头部、窗格右键、终端标签右键的文案；REQ-1、REQ-2。

#### 备选项

- 新增按钮并改名区分（采纳）
- 头部按钮改回 chat view
- 只新增不改名

#### 关联文档与需求点

- [方案 §4](solutions/overview.md)、[REQ-1/REQ-2](requirements/requirement.md)

## 3. 开发记录

### 2026-10-23 新增头部按钮与改名

- 本轮目标：头部新增「切到聊天视图」，与「在新聊天中接管」并存且名字区分。
- 完成内容：新增按钮组件与文案模块；头部与窗格接线复用现有 chat view 判断和切换；三处文案改名；两条上游测试跟随改名；登记 fork 功能、策略与文档。
- 代码或文档变更：`src/renderer/src/components/terminal-chat-view-button/**`；接缝 `TerminalPaneHeaderOverlay.tsx`、`TerminalPaneSurface.tsx`、`TerminalPaneResumeInChatButton.tsx`、`AiVaultSessionSurfaceSwitchMenuItems.tsx`、`TerminalContextMenu.tsx`、两个上游测试、`en.json`、`zh.json`、`en-runtime-required.json`（补一条旧文案）；`config/fork-features.jsonc`、`config/architecture-policies.jsonc`、`.gitignore`；本目录文档。
- 验证证据：TC-1～TC-4 通过，详见[测试记录](tests/runs/2026-10-23-本机与SSH真机验证.md)；`pnpm tc` 通过。
- 未解决问题：其他语言（es、fr、ja、ko）暂用英文；上游原文案 key 仍在语言文件中但不再被引用。
- 下一步：提交 PR 合入 `fork/integration`，出包后在正式应用中复验。

### 2026-10-23 独立审查后改为最小接缝

- 本轮目标：按独立代码审查的意见减少对上游文件的改动，降低同步冲突。
- 完成内容：接管按钮与终端标签菜单改回上游代码，只在 `zh.json` 把上游 key 的中文改为「在新聊天中接管」；右键菜单只换 key 与默认值；头部只加一个可选回调；新文案放到语言文件末尾的 fork 块；撤回两个上游测试与 `en-runtime-required.json` 的改动；测试去掉断言 mock 文字的用例，补上「已在聊天视图则隐藏」的有效守卫；登记表为接管按钮加守护接缝。
- 代码或文档变更：上游文件从 10 个降到 5 个（头部、Surface、右键菜单、`en.json`、`zh.json`）；本目录方案与需求同步更新。
- 验证证据：功能 checks 与相关上游测试 72 用例通过；两个反向对照分别失败；本机与 SSH 真机重跑通过，详见[测试记录](tests/runs/2026-10-23-本机与SSH真机验证.md)。
- 未解决问题：英文界面接管按钮仍叫「Continue in Chat UI」；三个对话类图标外观接近，只能靠提示区分。
- 下一步：更新 PR #65，等 CI。

### 2026-10-23 PR CI 暴露的回归

- 本轮目标：修复 PR #65 CI 中 `terminal-pane-element-file-drop.test.tsx` 的 19 个失败。
- 完成内容：失败原因是 `TerminalPaneSurface` 直接调用 controller 上的 `canToggleChatForLeaf`，而该上游测试用部分字段的 controller 渲染 Surface（类型断言绕过了类型检查）。改为照 `activePaneCanResumeInChat` 的模式在 `use-terminal-pane-projection.ts` 预先算出 `activePaneCanToggleChat`，Surface 只读布尔值；上游测试无需改动。教训：改动终端窗格时要跑整个 `src/renderer/src/components/terminal-pane` 目录，而不只是直接相关的测试文件。
- 代码或文档变更：`use-terminal-pane-projection.ts`（新增接缝）、`TerminalPaneSurface.tsx`；登记表与策略白名单；方案 §2。
- 验证证据：`terminal-pane` 与功能目录 556 个测试文件 5594 用例通过；i18n、标签栏、右侧栏 404 个测试文件通过；`pnpm tc` 通过。
- 未解决问题：无新增。
- 下一步：合入最新 `fork/integration` 后重推，等 CI。

### 2026-10-23 合入「终端聊天视图恢复」后统一标签右键的名字

- 本轮目标：合入最新 `fork/integration`（含 PR #66 恢复的终端标签右键就地切换项），保证三个就地切换入口同名、与接管项不同名。
- 完成内容：PR #66 的就地切换项读上游 key，而本功能把该 key 的中文改成了「在新聊天中接管」，合流后中文会把就地切换显示成接管，英文则与接管项同名。把该项改读本功能的 `terminalChatViewButton.switchToChatView`；改的是 fork 文件 `TerminalTabViewSwitch.tsx`，不增加上游接缝；它在 `SortableTabContextMenu.test.tsx` 新增的三处断言跟随新名字；登记表为该文件加守护接缝。该改动单独提交在「终端聊天视图恢复」范围内，并记入其 journal。
- 代码或文档变更：`src/renderer/src/native-chat-view-recovery/TerminalTabViewSwitch.tsx`、`SortableTabContextMenu.test.tsx`、`config/fork-features.jsonc`；本目录需求、方案、测试用例与测试记录；`docs/issue/终端聊天视图恢复/` 的需求与 journal。
- 验证证据：`tab-bar`、`terminal-pane`、i18n 与两个功能目录共 6457 用例通过，反向对照失败；fork 功能、fork 文档、架构策略、三项本地化门禁通过；本机与 SSH 真机标签右键为「切到聊天视图 ⌘⇧J」，本机另有「在新聊天中接管」，见[测试记录](tests/runs/2026-10-23-本机与SSH真机验证.md)。
- 未解决问题：SSH 夹具首次连接失败一次，重跑通过；切回终端的标签菜单项仍是上游文案「Continue with Terminal Agent」（中文沿用上游翻译），未纳入本次改名。
- 下一步：推送 PR #65，等 CI。

### 2026-11-21 上游同步到 fa60d0a566

- 本轮目标：`fork/integration` 从 `e723de1bfd` 合入上游到 `fa60d0a566`（四次合并：`22afb84f6a`、`9c3b42f644`、`d725f407e8`、`31df22fb1a`，冲突都在第一次），保留终端头部「切到聊天视图」按钮与「在新聊天中接管」的命名区分。
- 完成内容：本功能 5 个冲突（UU 3、UD 2）。上游把终端面板拆进 `titles/`、`controller/`、`chat/`、`context-menu/` 子目录：`TerminalPaneHeaderOverlay.tsx`（UD）移植到 `terminal-pane/titles/`；`use-terminal-pane-projection.ts`（UD）被拆成 `chat/use-terminal-pane-chat-projection.ts` 与 `controller/use-terminal-pane-projection.ts`，fork 的 `activePaneCanToggleChat` 跟到后者；`TerminalContextMenu.tsx` 上游删 `translate` 统一用 `t()`，fork 文案随之改成 `t('terminalChatViewButton.switchToChatView', 'Switch to Chat View')`。桌面 zh 词条表里 `SortableTabContextMenu.switchToChatView` 保留 fork 的「在新聊天中接管」（上游为「在聊天中继续」）。上游删除的 `TerminalPaneHeaderOverlay.test.tsx`（#39270）不再放进 checks。
- 代码或文档变更：`config/fork-features.jsonc` 接缝 9→10 条：4 条换路径，`TerminalContextMenu.tsx` 改到 `context-menu/` 并换 mustContain，新增 `controller/use-terminal-pane-projection.ts`（`activePaneCanToggleChat,`）；checks 只留自有目录；`dependsOn` 2 条换路径。合并后没有本功能的单独修复提交。新棘轮基线登记 1 条：render-path-translate `TerminalPaneChatViewButton.tsx` 1 处，React Compiler 不编译，行为同合并前（`config/render-path-translate-baseline.txt`，提交 `6244eac0a4`）。
- 验证证据：登记 checks 1 文件 2 项通过（`/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/sync-checks-run3.log`）；冲突解法见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/report-D-terminal-chat.md`、`report-G-shared.md`、`phase2-D.tsv`；棘轮清单 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/ratchet-refactor-backlog.tsv`，当前 HEAD 棘轮复核 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/journal-records/ratchets-at-2abf3d8ad1.log`；最终门禁见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/final-gates.log`。本机真机抽查通过：头部「Switch to Chat View」与右键 ⌘⇧J 项都在，切到聊天视图后「Show terminal」可切回（`/Users/bytedance/dev/orca/.docs/upstream-sync-ui-validation/2026-11-21/README.md` 第 4 项，截图 `evidence/cv-1`～`cv-3`）。SSH 未覆盖。
- 未解决问题：`TerminalPaneChatViewButton.tsx` 的渲染期翻译登记在 render-path-translate 基线里，待改成 `useTranslate()` 后从基线移除，跟踪：Fartown/orca#153；SSH 工作区没有在同步后复验。
- 下一步：按 Fartown/orca#153 改写渲染期翻译并缩减基线；下次真机回归补 SSH 工作区。
