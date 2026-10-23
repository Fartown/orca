---
title: 终端聊天视图恢复
document_type: journal
status: testing
created: 2026-10-23
updated: 2026-10-23
issue: 终端聊天视图恢复
external_ids: []
---

# 终端聊天视图恢复

## 1. 关键文档链接

| 类型     | 文档                                                    | 状态         | 说明                                             |
| -------- | ------------------------------------------------------- | ------------ | ------------------------------------------------ |
| 需求     | [终端聊天视图恢复](requirements/终端聊天视图恢复.md)    | ready        | REQ-1801～1803                                   |
| 交互     | -                                                       | not-required | 恢复已有菜单与快捷键                             |
| 方案     | -                                                       | not-required | 接入现有 toggleViewMode；不新增会话控制链路      |
| 测试用例 | [切换与绑定](tests/cases/切换与绑定.md)                 | ready        | 双向入口、本地、SSH、历史只读                    |
| 测试执行 | [本机与SSH验收](tests/runs/2026-10-23-本机与SSH验收.md) | completed    | 双向菜单、进程及 transcript 保留；正式发布待完成 |

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
