---
title: 终端聊天视图恢复
document_type: journal
status: testing
created: 2026-10-23
updated: 2026-11-16
issue: 终端聊天视图恢复
external_ids: [Fartown/orca#112, Fartown/orca#119]
---

# 终端聊天视图恢复

## 1. 关键文档链接

| 类型     | 文档                                                    | 状态         | 说明                                             |
| -------- | ------------------------------------------------------- | ------------ | ------------------------------------------------ |
| 需求     | [终端聊天视图恢复](requirements/终端聊天视图恢复.md)    | ready        | REQ-1801～1804                                   |
| 交互     | -                                                       | not-required | 恢复已有菜单与快捷键                             |
| 方案     | -                                                       | not-required | 接入现有 toggleViewMode；不新增会话控制链路      |
| 测试用例 | [切换与绑定](tests/cases/切换与绑定.md)                 | ready        | 双向入口、本地、SSH、历史只读                    |
| 测试执行 | [本机与SSH验收](tests/runs/2026-10-23-本机与SSH验收.md) | completed    | 双向菜单、进程及 transcript 保留；正式发布待完成 |

- 本轮测试：[持续绑定恢复验收](tests/runs/2026-11-15-持续绑定恢复验收.md)，completed；覆盖 REQ-1804。

## 2. 决策点记录

- 2026-10-23：根因是标签右键菜单用 isChatView 隐藏了终端到聊天的方向；终端面板右键和快捷键已支持。恢复同一标签的现有切换，不把它替换为创建新会话或恢复 provider。
- 界面展示由客户端持有，终端和 transcript 继续由本地或 SSH 执行主机持有；不新增协议、主机连接或配置。

## 3. 开发记录

### 2026-10-23 登记与实施（implementing）

- 本轮目标：恢复标签入口，并校验指定历史会话绑定。
- 完成内容：核对现有两个菜单及切换回调；建立独立功能分支和需求登记。
- 代码或文档变更：登记、需求和验收用例；实现放在功能拥有目录。
- 验证证据：源码核对；真实界面和自动化验证待执行。
- 未解决问题：历史标签的实际元数据仍需核对；尚未出包安装。
- 下一步：实现入口、完成本地与 SSH 验收及所有门禁，合入正式发包。

### 2026-10-23 双向菜单和历史绑定验收（testing）

- 本轮目标：完成入口回归与真实本机、SSH 验证。
- 完成内容：功能拥有目录中的菜单项调用已有回调，支持双向标签切换并复用跨平台快捷键与现有翻译。历史标签通过已有 hook 入口重放 transcript 已记录的完成事件，补齐 provider 元数据；未向 provider 发送消息或恢复进程。
- 代码或文档变更：SortableTabContextMenu 接线、既有菜单回归测试、需求及登记。
- 验证证据：26 项相关测试、四目标 pnpm tc、三项本地化、架构、fork 功能和文档、变更代码质量通过。本机与 SSH 使用正常 AppImage 的后台隔离实例，双向菜单及历史正文可见；原 handle、incarnation、shell PID 保持，测试 transcript SHA256 保持。用户历史 transcript 的大小、mtime 和 SHA256 前后一致，已有 Codex PID 4013571 保留。证据见本轮 Test Run 与 .docs/native-chat-view-ui-validation/2026-10-23/。
- 未解决问题：代码尚未随正式包交付；网页端旧的独立 folderWorkspace 目录入口在隔离实例未显示，本轮菜单验收采用已有 folder 项目，未将该目录问题计作通过。
- 下一步：提交、合入 fork/integration，正式安装后复核原标签菜单和更新状态。

### 2026-10-23 标签菜单入口改用「切到聊天视图」（testing）

- 本轮目标：与「终端头部切到聊天视图」合流后，标签右键的就地切换项不再与「在新聊天中接管」同名。
- 完成内容：该功能把上游 key `components.tab.bar.SortableTabContextMenu.switchToChatView` 的中文改为「在新聊天中接管」（接管按钮与标签菜单里的接管项仍读这个 key）；本功能的就地切换项若继续用它，中文会显示成接管。改为读 `terminalChatViewButton.switchToChatView`，中英文为「切到聊天视图 / Switch to Chat View」，与头部按钮、窗格右键一致；切回终端的文案不变。
- 代码或文档变更：`TerminalTabViewSwitch.tsx` 换文案 key；`SortableTabContextMenu.test.tsx` 中本功能新增的三处断言跟随新名字；REQ-1801 文案；登记表在「终端头部切到聊天视图」下为本文件加守护接缝。
- 验证证据：见「终端头部切到聊天视图」同日开发记录与测试记录。
- 未解决问题：无新增。
- 下一步：随 PR #65 合入 `fork/integration`。

### 2026-11-15 持续失去输入绑定的恢复门禁（testing）

- 本轮目标：定位并修复用户确认的持续禁用、必须切回终端才能继续的问题，不把瞬时附着提示当作已覆盖。
- 完成内容：真实安装包配对主机、隔离隐藏实例的故障注入证明，同一恢复请求在聊天模式被拒绝，终端模式获准。源码追到 structured native chat 引入的 blanket viewMode 禁令，与 fork 恢复的原终端聊天展示冲突。
- 代码或文档变更：复用现有恢复实例注册表，登记实例所属 tab 和实时的可见终端聊天覆盖层；保留两种 tab 索引的保护，但为当前真实终端聊天放行，并在等待 liveness 后再次确认所有权。新增 REQ-1804、TC-1805～1808；登记新接缝、依赖与测试。未新增主机连接或重试器。
- 验证证据：4 项新增恢复用例在旧版失败；功能检查 80 项、额外终端回归 45 项通过（两组含交集）；pnpm tc、E2E 构建、架构、fork 登记与文档、三项本地化通过。修复版在真实本地、mini 配对及经 SSH 隧道访问 mini 的隐藏实例中，调用同一真实恢复入口后均保持 viewMode=chat、原 PTY 身份并恢复 contenteditable=true；不向 provider 发消息。详见 [持续绑定恢复验收](tests/runs/2026-11-15-持续绑定恢复验收.md)。原始证据位于主 checkout 的 .docs/mini-chat-terminal-binding-ui-validation/2026-11-15/。
- 未解决问题：历史截图最初丢失绑定的事件未留下完整状态轨迹；“不能自愈”的门禁已实证，不能将故障注入说成历史触发证明。SSH 真实验收为隧道访问配对服务，未覆盖原生 SSH relay 自动部署；本轮未修改该流程。运行中的用户 .81 安装包未替换。
- 下一步：完成最终 check:changed，提交关联 Issue #112 的 PR，等待 CI 并合入；保持用户正在运行的程序及终端不动。

### 2026-11-16 Codex 发送结果与 UI 气泡（testing）

- 本轮目标：修复终端聊天显示已发、Codex 原始会话未收到时没有投递状态的问题。
- 完成内容：真实 .84 安装包、pending cache、mini 原始 transcript 三方对照，确认 11:17 原消息仍在本地缓存且无 delivery 标记；11:28 是措辞不同的后一次消息。安装包确认只有 Claude 接入 verified outcome，Codex 仍忽略 fire-and-forget 结果。
- 代码或文档变更：登记 Codex 发送接缝与 REQ-1805，新增整合真实 composer hook、PTY 发送队列和 pending delivery 的回归；接入既有确认发送、拒绝提示与未知投递保留。真实本地 UI 又发现默认 verified 会把 false 回退为无确认发送，因此 Codex 增加已有 onDeliverySettled 回调以请求严格写入确认；Claude 策略保留。
- 验证证据：6 项新增整合回归在旧版失败；补齐严格确认和图片、Claude 保留回归后，11 份相关测试共 143 项通过。真实旧 .84 与修复版后台 UI 对照：同样不存在的 PTY，旧版普通气泡，修复版“消息未发送”且不发 Enter。真实 SSH 隧道下 mini 对缺失 handle 返回 terminal_handle_stale，修复版同样正确标记，用户原终端未写入任何测试文字。详见 [Codex投递验收](tests/runs/2026-11-16-Codex投递验收.md)。现场数据仅本地 .docs/native-chat-terminal-send-ui-validation/2026-11-16/ 保存。
- 未解决问题：没有逐写回执能唯一解释原 11:17 RPC 失败原因，不能把同时存在的连接错误当作精确逐写证据。
- 下一步：跑完最后编辑后的完整门禁，提交 Issue #119 的 PR 并等 CI。用户 .84 原消息的缓存已标记 unconfirmed，文字保留、未补发；运行中程序未替换。
