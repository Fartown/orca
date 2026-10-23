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
| 就地 chat view | 窗格右键、⌘⇧J（`toggleNativeChatForLeaf` / `handleToggleNativeChat`）            | 同一标签切成聊天视图，agent 继续运行        | `canToggleChatForLeaf`：agent 支持聊天视图（Codex、Claude 等），本机或 SSH |
| 新聊天接管     | 头部按钮 `TerminalPaneResumeInChatButton`、终端标签右键 `CliChatResumeMenuItems` | 新开聊天标签接管对话，要求终端 agent 已退出 | 只对本机执行的终端                                                         |

两者都用 `components.tab.bar.SortableTabContextMenu.switchToChatView`（「在聊天界面中继续」）这一条文案。

## 2. 改动

- 新增 `src/renderer/src/components/terminal-chat-view-button/`：
  - `TerminalPaneChatViewButton.tsx`：头部按钮，`ghost` + `icon-xs`，与相邻按钮同一 `pane-title-split-trigger` 显隐规则，图标 `MessageSquare`（接管按钮是 `MessagesSquare`），提示框尾随 `ShortcutKeyCombo`。
  - `chat-surface-labels.ts`：两条新文案 `components.terminal-chat-view-button.switchToChatView`、`…takeOverInNewChat`。
- 上游接缝：
  - `TerminalPaneHeaderOverlay.tsx`：新增 `canSwitchToChatView`、`onSwitchToChatView` 两个可选属性；不在聊天视图时，在活动窗格渲染新按钮，原有分支不动。
  - `TerminalPaneSurface.tsx`：`canSwitchToChatView = !activePaneIsChatLeaf && canToggleChatForLeaf(活动窗格)`，`onSwitchToChatView = handleToggleNativeChat`，与窗格右键同一判断、同一动作。
  - 改名：`TerminalPaneResumeInChatButton.tsx`、`AiVaultSessionSurfaceSwitchMenuItems.tsx`（终端标签菜单的接管项）改用「在新聊天中接管」；`TerminalContextMenu.tsx` 的 chat view 项改用「切到聊天视图」。
  - 两个上游测试按新名字查找元素；`en.json`、`zh.json` 增加两条文案。
  - 上游原文案 key 不再有代码引用，按本地化门禁要求在 `en-runtime-required.json` 补上这一条（只加一条，不整体重新生成）。

## 3. 在哪台机器上

纯渲染层改动，运行在客户端。就地 chat view 的数据读取沿用现有实现：SSH 工作区的会话记录由执行主机提供。不新增文件、端口、环境变量、配置或服务，不改任何客户端与主机之间的协议。

## 4. 备选方案

| 方案                                | 结论   | 原因                                   |
| ----------------------------------- | ------ | -------------------------------------- |
| 新增按钮 + 两个功能改名区分（采纳） | 采纳   | 用户选择；两个功能都保留，名字不再混淆 |
| 把头部按钮改回 chat view            | 不采纳 | 用户要求新增而不是替换                 |
| 只新增按钮、不改名                  | 不采纳 | 两个按钮同名，混淆更严重               |

## 5. 兼容

- 上游原文案 key 保留在语言文件中，只是本仓库不再引用；同步上游时冲突面限于上述接缝。
- 移动端不受影响。
