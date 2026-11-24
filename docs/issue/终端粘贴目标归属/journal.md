---
title: 终端粘贴目标归属
status: testing
created: 2026-11-17
updated: 2026-11-17
external_ids:
  - Fartown/orca#137
---

# 终端粘贴目标归属

## 1. 关键文档链接

| 类型     | 文档                                                 | 状态         | 说明                             |
| -------- | ---------------------------------------------------- | ------------ | -------------------------------- |
| 需求     | [目标与范围](requirements/requirement.md)            | ready        | ⌘V 误取消与残留错误              |
| 测试用例 | [目标与恢复](tests/cases/粘贴目标与恢复.md)          | ready        | TC-001～TC-004                   |
| 测试记录 | [本地与 SSH](tests/runs/2026-11-17-本地与SSH粘贴.md) | completed    | 真实接收与身份断言通过           |
| 交互设计 | -                                                    | not-required | 复用现有终端错误提示，无布局变更 |

## 2. 决策点记录

### D-001 2026-11-17：固定手势时的执行目标

- 背景：用户确认入口为 ⌘V；受控复现同 pane helper 替换误取消和成功后红条残留。
- 备选项：移除焦点检查；在发送时重新选择目标；手势发起时捕获归属并持续校验原目标。
- 最终决定：复用既有焦点 pane 定位、目标检查、输入队列和按 pane 错误容器，保存初始归属事实。
- 原因：允许同一目标内部变化，同时保留真正切换目标和断联时的拒绝。
- 影响范围：REQ-001～REQ-003；无 RPC 或宿主协议变化，不增加重连或重发。

### D-002 2026-11-17：只允许较新粘贴更新反馈

- 背景：新增成功恢复不能让较早请求的迟到完成清除较新请求的失败提示。
- 备选项：任意完成均清理本 pane 错误；按同一 pane 的请求先后保留最新反馈。
- 最终决定：错误 sink 的弱引用保存每 pane 的最新请求标记，切换 tab 重装监听时延续；旧请求仍按原目标安全执行，但不能覆盖新反馈。
- 原因：避免隐藏尚未发送的新消息或让旧失败重新出现。
- 影响范围：REQ-002 的实现约束与 TC-005，无发送顺序或重试策略变更。

## 3. 开发记录

### 2026-11-21：上游同步到 fa60d0a566

- 本轮目标：`fork/integration` 从 `e723de1bfd` 合入上游到 `fa60d0a566`（四次合并：`22afb84f6a`、`9c3b42f644`、`d725f407e8`、`31df22fb1a`，冲突都在第一次），保持按实际聚焦分屏固定粘贴目标与按面板记录粘贴错误。
- 完成内容：本功能 5 个冲突（UU 4、UD 1，其中 2 个是桌面 en/zh 词条表）。上游把粘贴代码搬到 `terminal-pane/input/paste/`，`terminal-pane-paste-execution.ts`、`terminal-pane-paste-listeners.ts` 以上游为底重放粘贴目标归属，保留上游新增的 `copiedFiles` / `onLocalImagePasted`；菜单粘贴先 `synchronizeTerminalKeyboardPane` 再 `pasteFromClipboard(pane, 'app-menu')`。`native-chat-paste-routing.test.tsx` 随上游移到 `native-chat/paste/`，补回守护粘贴归属的「keeps terminal-only paste unchanged」用例。合并后全量单测里上游 #41352 新增的两个菜单粘贴用例失败：它们只给模拟控制器提供 `setTerminalError`，而 fork 按面板写 `setTerminalErrorsByPaneId`；修复提交 `b4740de302` 补上该回调并按面板断言，测试意图不变。
- 代码或文档变更：`config/fork-features.jsonc` 接缝 5 条随上游换路径（`input/paste/` 下 4 个文件与 `native-chat/paste/` 测试），新增接缝 `terminal-pane-paste-listeners.test.ts`（mustContain `pasteErrorsFor(setTerminalErrorsByPaneId`，这条登记和对应的架构白名单是跟在 `85d32f323d` 里一起提交的）；checks 里 3 个上游测试换新路径；`dependsOn` 5 条换路径并补 `input/paste/terminal-paste-errors.ts`。新棘轮基线未登记本功能条目。
- 验证证据：登记 checks 5 文件 25 项通过（`/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/sync-checks-run3.log`）；修复前失败见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/verify/test-full.log`；冲突解法见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/report-D-terminal-chat.md`、`phase2-D.tsv`；最终门禁见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/final-gates.log`。本机真机抽查通过：两分屏下 Meta+V 只写聚焦窗格 PTY 一次、另一窗格 0 次（构建 `85d32f323d`，已含 `b4740de302`；`/Users/bytedance/dev/orca/.docs/upstream-sync-ui-validation/2026-11-21/README.md` 第 5 项，截图 `evidence/paste-1-split`）。SSH 未覆盖。
- 未解决问题：SSH 工作区下的粘贴归属没有在同步后的构建上复验。
- 下一步：下次真机回归时补 SSH 工作区的分屏粘贴。

### 2026-11-17：实现并完成两端功能验收

- 本轮目标：固定剪贴板手势的目标归属，修复已复现误取消及残留提示。
- 完成内容：保存初始焦点归属与原 PTY/transport；复用焦点 pane 定位；菜单复用同一剪贴板执行入口；失败返回 false；区分焦点、目标与连接；按 pane 恢复粘贴错误；较早请求的迟到结果不能覆盖较新反馈，监听重装后顺序仍保留。
- 代码或文档变更：`src/renderer/src/terminal-paste-ownership/`、四个上游接缝、英文/简体中文提示、功能登记和测试文档。
- 验证证据：91 项定向测试（含 Chat 覆盖层隔离）、完整 `pnpm tc` 通过；本地 Git 六场景与 Mini SSH folder 五场景均通过内容一次性、原 handle/PTY/incarnation、hidden/unfocused 断言，见测试记录。旧版多分屏路由对照也通过，因此不把活动分屏滞后列为本次根因。
- 未解决问题：本地公共语言包关联测试扩散，运行 705 秒后按仓库规则收敛；其中旧菜单测试依赖旧内部调用，已改为验证共享入口委派并定向重跑。技能摘要检查在干净基线 69428c84b39 也报同一 released-digests stale；用户原截图的具体触发时间线仍无日志，不能等同受控复现。
- 下一步：完成本地门禁、PR 和远端必需检查，再合入；用户 App 的安装发布单独记录。

### 2026-11-17：登记修复范围

- 本轮目标：修复快捷键目标归属和恢复提示，覆盖本地与 SSH。
- 完成内容：完成旧实现真实 PTY 受控复现，确认用户使用 ⌘V。
- 代码或文档变更：新增需求和 fork 功能登记。
- 验证证据：`.docs/terminal-paste-ui-validation/2026-11-17/README.md`；旧版五场景结果在 `evidence/paste-render-result.json`。
- 未解决问题：未修改产品代码；用户截图当次的焦点与绑定时间线无日志，不能认定具体触发条件。
- 下一步：实现稳定归属快照、准确错误与恢复，执行本地和 SSH 隔离验收。
