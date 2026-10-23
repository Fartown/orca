---
title: '终端头部切到聊天视图 方案'
document_type: solution
status: approved
created: 2026-10-23
updated: 2026-10-23
---

# 终端头部切到聊天视图 方案

## 1. 现状

| 功能           | 入口                                                                             | 行为                                        | 可用条件                                                                   |
| -------------- | -------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| 就地 chat view | 窗格右键、⌘⇧J（`handleToggleNativeChat`）                                        | 同一标签切成聊天视图，agent 继续运行        | `canToggleChatForLeaf`：agent 支持聊天视图（Codex、Claude 等），本机或 SSH |
| 新聊天接管     | 头部按钮 `TerminalPaneResumeInChatButton`、终端标签右键 `CliChatResumeMenuItems` | 新开聊天标签接管对话，要求终端 agent 已退出 | 只对本机执行的终端                                                         |

两者都用上游 key `components.tab.bar.SortableTabContextMenu.switchToChatView`（「在聊天界面中继续」）。上游 #27184（2026-10-12）有意把头部的就地 chat view 换成了新聊天接管，并在 `TerminalPaneHeaderOverlay.test.tsx` 断言头部不再有「Show chat view」。本功能按用户决定在头部加回就地切换，方向与上游相反（新按钮的名字不同，上游该断言仍成立）。

## 2. 改动（以最少的上游接缝为准）

- 功能目录 `src/renderer/src/components/terminal-chat-view-button/TerminalPaneChatViewButton.tsx`：`ghost` + `icon-xs`，与相邻按钮同一 `pane-title-split-trigger` 显隐规则，图标 `MessageSquare`（与右键菜单的 chat view 项一致；接管按钮是 `MessagesSquare`），提示框尾随 `ShortcutKeyCombo`（⌘⇧J / Ctrl+Shift+J），文案 key `terminalChatViewButton.switchToChatView`。
- 上游接缝（5 个文件）：
  - `TerminalPaneHeaderOverlay.tsx`：新增一个可选回调 `onSwitchToChatView`，存在且不在聊天视图时在活动窗格渲染新按钮；import 放在已有的 Goal 接缝旁。
  - `TerminalPaneSurface.tsx`：`onSwitchToChatView = canToggleChatForLeaf(活动窗格) ? handleToggleNativeChat : undefined`，与右键菜单、快捷键同一判断、同一动作。不复用 `onShowTerminal`：上游若把它改成只切回终端，按钮会无声失效。
  - `TerminalContextMenu.tsx`：就地 chat view 项只换文案 key 与默认值。
  - `en.json`、`zh.json`：在文件末尾的 fork 块（`goals` 之后）新增 `terminalChatViewButton.switchToChatView`；`zh.json` 把上游 key 的中文改为「在新聊天中接管」。
- 接管按钮与终端标签菜单的代码不动，仍读上游 key；登记表里为 `TerminalPaneResumeInChatButton.tsx` 加了守护接缝，上游换 key 时门禁会报红，而不是中文名无声失效。

## 3. 在哪台机器上

纯渲染层改动，运行在客户端。就地 chat view 的数据读取沿用现有实现：SSH 工作区的会话记录由执行主机提供。不新增文件、端口、环境变量、配置或服务，不改任何客户端与主机之间的协议。

## 4. 备选方案

| 方案                                            | 结论   | 原因                                                                                                              |
| ----------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| 新按钮 + 接管按钮沿用上游 key、只改中文（采纳） | 采纳   | 上游接缝 5 个文件；接管按钮、标签菜单、上游测试与运行时文案清单都不用碰                                           |
| 新按钮 + 两个功能都换新 key                     | 不采纳 | 第一版做法：要多改接管按钮、标签菜单、2 个上游测试和 `en-runtime-required.json`，共 10 个上游文件，同步冲突面翻倍 |
| 把头部按钮改回 chat view                        | 不采纳 | 用户要求新增而不是替换                                                                                            |
| 只新增按钮、不改名                              | 不采纳 | 中文里两个按钮同名                                                                                                |

## 5. 风险

- 中文里上游 key 从此只表示「移到新聊天」。上游若在就地切换场景重新使用这个 key，中文会显示错；上游方向（#27184 与标签菜单测试「hides switching … into chat view」）是让它表示「移到新聊天」，风险低。
- 英文界面接管按钮仍叫「Continue in Chat UI」。
- 同步上游时，若 `TerminalPaneHeaderOverlay` 新增必填属性，本功能测试会类型报错，需要补参数。
