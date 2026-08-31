# 工作包 0：实验实现逐文件 owner 清单

状态：`implementing`  
事实源：`snapshot-20260825/tracked.patch` 与 `snapshot-20260825/untracked.tar.gz`  
规则：此表只决定合并后的归位责任；核心代码必须在 latest main 接缝上逐文件择取或重写，任何 `不重放` 项均不得以死代码、隐藏入口或后台注册保留。

## 归位口径

- `WP1–WP9`：由对应工作包 owner 在 latest main 上重新审阅后择取，不能整块套用旧 patch。
- `§13 / 半态清理`、`§12.3 热点清理`：不重放；若 origin/main 自身存在同名正常能力，只删除实验 Issue 接入，不破坏上游原功能。
- `既有分支本地工作`：与本目标无关但属于用户现有改动，单独重放并保持语义。
- `WP0 待归位`：默认不重放，直到代码证据证明它是 WP1–WP9 的必要接缝。

覆盖：95 个 tracked patch 文件 + 214 个归档条目，共 309 项。

合并后另检测到两项不在快照中的并发 goal-mode 改动，归属既有 goal-mode 工作并原样保留：

| 路径 | owner | 处置 |
| --- | --- | --- |
| `goal-mode/cli/orca-goal.mjs` | 既有 goal-mode 并发工作 | 保留；不纳入 Issue 工作包 |
| `goal-mode/cli/goal-cli-flags.mjs` | 既有 goal-mode 并发工作 | 保留；不纳入 Issue 工作包 |

| 路径 | 快照来源 | owner | 合并后处置 |
| --- | --- | --- | --- |
| `config/scripts/verify-packaged-daemon-entry.cjs` | tracked.patch | 既有分支本地工作 | 独立保留并在 latest main 上重放；不并入 Issue 工作包 |
| `config/scripts/verify-packaged-daemon-entry.test.mjs` | tracked.patch | 既有分支本地工作 | 独立保留并在 latest main 上重放；不并入 Issue 工作包 |
| `mobile/app/h/[hostId]/index.tsx` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/app/h/_layout.tsx` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/src/notifications/local-notification-scheduling.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/src/notifications/notification-routing.test.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/src/notifications/notification-routing.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/agent-hooks/server.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/main/artifacts/artifact-cloud-config.test.ts` | tracked.patch | 既有分支本地工作 | 独立保留并在 latest main 上重放；不并入 Issue 工作包 |
| `src/main/artifacts/artifact-cloud-config.ts` | tracked.patch | 既有分支本地工作 | 独立保留并在 latest main 上重放；不并入 Issue 工作包 |
| `src/main/index.ts` | tracked.patch | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/ipc/dashboard-payload-validation.test.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/ipc/dashboard-payload-validation.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/ipc/dashboard-popout.test.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/ipc/dashboard-popout.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/ipc/notification-options.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/ipc/notifications.test.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/ipc/notifications.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/ipc/pty.test.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/main/ipc/pty.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/main/local-worktree-filesystem.ts` | tracked.patch | WP2 | 按 hashed claim、retry/forget、Resume guard 目标择取 |
| `src/main/native-chat/transcript-line-decoders-codex.ts` | tracked.patch | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/native-chat/transcript-reader-codex-history-mode.test.ts` | tracked.patch | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/runtime/agent-session-claim-identity.test.ts` | tracked.patch | WP2 | 按 hashed claim、retry/forget、Resume guard 目标择取 |
| `src/main/runtime/agent-session-claim-identity.ts` | tracked.patch | WP2 | 按 hashed claim、retry/forget、Resume guard 目标择取 |
| `src/main/runtime/mobile-notification-replay.test.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/runtime/mobile-rpc-allowlist.test.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/runtime/orca-runtime.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/main/runtime/rpc/methods/agent-session.ts` | tracked.patch | WP8 | 仅为 Resume/Continue identity guard 择取，保持原启动语义 |
| `src/main/runtime/rpc/methods/client-events.test.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/runtime/rpc/methods/client-events.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/runtime/rpc/methods/client-ui-schemas.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/runtime/rpc/methods/index.ts` | tracked.patch | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/runtime/runtime-rpc.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/ssh/ssh-relay-session.ts` | tracked.patch | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/text-generation/commit-message-text-generation.ts` | tracked.patch | §13 digest 清理 | 不重放 |
| `src/preload/api-types.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/preload/api/dashboard-api.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/preload/api/pty-api.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/preload/api/ui-command-event-api.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/preload/index.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/relay/agent-hook-server.ts` | tracked.patch | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/renderer/src/App.tsx` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/activity/ActivityPrototypePage.tsx` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/activity/useActivityUnreadCount.test.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/activity/useActivityUnreadCount.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/dashboard-popout/AgentKanbanBoard.test.tsx` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/dashboard-popout/AgentKanbanBoard.tsx` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/dashboard-popout/AgentKanbanCard.test.tsx` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/dashboard-popout/AgentKanbanCard.tsx` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/dashboard/AgentDashboardDrawer.tsx` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/dashboard/useDashboardPopoutBridge.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/sidebar/SidebarHeader.tsx` | tracked.patch | §12.3 旧 Sidebar 清理 | 不重放；WP6 改 latest main sidebar/index，不改 SidebarHeader |
| `src/renderer/src/components/sidebar/index.tsx` | tracked.patch | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/sidebar/use-sidebar-host-scope-options.ts` | tracked.patch | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/terminal-pane/pty-connection-types.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/renderer/src/components/terminal-pane/pty-connection.test.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/renderer/src/components/terminal-pane/pty-connection.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/renderer/src/components/terminal-pane/pty-transport-types.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/renderer/src/components/terminal-pane/pty-transport.test.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/renderer/src/components/terminal-pane/pty-transport.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/renderer/src/components/terminal-pane/remote-runtime-pty-transport.test.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/renderer/src/components/terminal-pane/remote-runtime-pty-transport.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/renderer/src/components/terminal-pane/use-notification-dispatch.test.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/terminal-pane/use-notification-dispatch.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/terminal-pane/use-terminal-pane-lifecycle.ts` | tracked.patch | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/renderer/src/hooks/agent-hook-completion-notifications.test.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/hooks/agent-hook-completion-notifications.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/hooks/useIpcEvents.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/lib/launch-agent-in-new-tab-web-runtime.test.ts` | tracked.patch | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/renderer/src/lib/launch-agent-in-new-tab.test.ts` | tracked.patch | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/renderer/src/lib/launch-agent-in-new-tab.ts` | tracked.patch | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/renderer/src/lib/launch-agent-web-host-tab.ts` | tracked.patch | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/renderer/src/lib/right-sidebar-visibility.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/lib/titlebar-worktree-history-controls.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/lib/worktree-activation.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/runtime/remote-agent-session-launch.test.ts` | tracked.patch | WP8 | 仅为 Resume/Continue identity guard 择取，保持原启动语义 |
| `src/renderer/src/runtime/remote-agent-session-launch.ts` | tracked.patch | WP8 | 仅为 Resume/Continue identity guard 择取，保持原启动语义 |
| `src/renderer/src/runtime/runtime-client-events.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/runtime/web-runtime-session.test.ts` | tracked.patch | WP8 | 仅为 Resume/Continue identity guard 择取，保持原启动语义 |
| `src/renderer/src/runtime/web-runtime-session.ts` | tracked.patch | WP8 | 仅为 Resume/Continue identity guard 择取，保持原启动语义 |
| `src/renderer/src/store/slices/terminals.ts` | tracked.patch | §12.3 热点清理 | 不重放；持久 Conversation 不进入 terminal slice |
| `src/renderer/src/store/slices/ui.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/store/slices/worktree-nav-history.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/agent-hook-listener.ts` | tracked.patch | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/shared/agent-hook-relay.ts` | tracked.patch | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/shared/agent-session-host-authority.ts` | tracked.patch | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/shared/dashboard-snapshot.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/notification-settings-types.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/protocol-version.ts` | tracked.patch | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/shared/runtime-client-events.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/runtime-types.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/top-level-view.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/ui-chrome-types.ts` | tracked.patch | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/worktree/launch-types.ts` | tracked.patch | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `goal-mode/docs/50-方案-删掉空转熔断.md` | untracked.tar.gz | 既有分支本地工作 | 独立保留并在 latest main 上重放；不并入 Issue 工作包 |
| `mcp-gateway/standalone.json` | untracked.tar.gz | 既有分支本地工作 | 独立保留并在 latest main 上重放；不并入 Issue 工作包 |
| `mobile/app/h/[hostId]/issues.tsx` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/app/h/[hostId]/issues/[conversationId].tsx` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/src/issues/mobile-issue-authorities.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/src/issues/mobile-issue-authorities.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/src/issues/mobile-issue-data.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/src/issues/mobile-issue-data.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/src/issues/mobile-issue-route.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/src/issues/mobile-issue-route.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/src/issues/mobile-issue-screen-model.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/src/issues/mobile-issue-screen-model.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `mobile/src/issues/mobile-issue-screen-styles.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/ipc/issues.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/ipc/issues.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/active-profile-issue-repository.test.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/active-profile-issue-repository.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/conversation-allocator.test.ts` | untracked.tar.gz | WP2 | 按 hashed claim、retry/forget、Resume guard 目标择取 |
| `src/main/issues/conversation-allocator.ts` | untracked.tar.gz | WP2 | 按 hashed claim、retry/forget、Resume guard 目标择取 |
| `src/main/issues/conversation-hook-identity-ingestor.test.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/issues/conversation-hook-identity-ingestor.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/issues/conversation-identity-repository.ts` | untracked.tar.gz | WP2 | 按 hashed claim、retry/forget、Resume guard 目标择取 |
| `src/main/issues/conversation-launch-claim-repository.ts` | untracked.tar.gz | WP2 | 按 hashed claim、retry/forget、Resume guard 目标择取 |
| `src/main/issues/conversation-record-queries.ts` | untracked.tar.gz | WP2 | 按 hashed claim、retry/forget、Resume guard 目标择取 |
| `src/main/issues/conversation-record-repository.ts` | untracked.tar.gz | WP2 | 按 hashed claim、retry/forget、Resume guard 目标择取 |
| `src/main/issues/external-issue-adapters.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/external-issue-adapters.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/external-issue-repository.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/external-issue-repository.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/external-issue-source-identity.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/index.ts` | untracked.tar.gz | WP5 | 按统一 IssueFeatureBootstrap 导出面重写/择取 |
| `src/main/issues/issue-activity-query.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-activity-query.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-authority-route.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-cache-route-index.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-client-data-service.test.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-client-data-service.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-dashboard-projection.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-dashboard-projection.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-database-core-schema.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-database-migrations.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-database-round-schema.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-database-support-schema.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-database.test-environment.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-database.test.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-database.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-delete-repository.ts` | untracked.tar.gz | WP4 | 按 CRUD、三级树和手工 external ref 目标择取 |
| `src/main/issues/issue-digest-draft-state.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-generation-runner.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-generation-runner.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-generation-state.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-generation-target.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-generation-target.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-input-budget.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-input-candidate.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-output-parser.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-output-parser.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-prompt.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-prompt.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-record.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-reference-candidates.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-repository.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-repository.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-round-candidates.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-runtime-coordinator.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-runtime-coordinator.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-snapshot-limits.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-snapshot.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-digest-snapshot.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-event-repository.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-hierarchy-lifecycle.test.ts` | untracked.tar.gz | WP4 | 按 CRUD、三级树和手工 external ref 目标择取 |
| `src/main/issues/issue-hierarchy-mutation.ts` | untracked.tar.gz | WP4 | 按 CRUD、三级树和手工 external ref 目标择取 |
| `src/main/issues/issue-hierarchy-validation.ts` | untracked.tar.gz | WP4 | 按 CRUD、三级树和手工 external ref 目标择取 |
| `src/main/issues/issue-host-partition.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-host-state.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-lifecycle-repository.ts` | untracked.tar.gz | WP4 | 按 CRUD、三级树和手工 external ref 目标择取 |
| `src/main/issues/issue-link-repository.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-list-snapshot.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-mobile-pending-query.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-mobile-pending-query.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-mutation-receipt.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-notification-click-target.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-query-cursor.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-query-projections.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-query-service.test.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-query-service.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-read-cache.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-read-cache.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-record-queries.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-record-repository.ts` | untracked.tar.gz | WP4 | 按 CRUD、三级树和手工 external ref 目标择取 |
| `src/main/issues/issue-repository-error.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-repository-types.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-repository.test.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-repository.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/issue-row-mappers.ts` | untracked.tar.gz | WP4 | 按 CRUD、三级树和手工 external ref 目标择取 |
| `src/main/issues/issue-runtime-composition.test.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-runtime-composition.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-runtime-service.test.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-runtime-service.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/issues/issue-search-document-builder.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-search-index.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-search-index.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/issue-sibling-order.ts` | untracked.tar.gz | WP1 | 按 latest main 与正式 schema v1 重写/择取 |
| `src/main/issues/legacy-activity-migration.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/legacy-activity-migration.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/round-record-body-persistence.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/round-record-ingestor.test.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/issues/round-record-ingestor.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/issues/round-record-provider-turn-ref.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/issues/round-record-queries.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/issues/round-record-reconciliation.test.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/issues/round-record-reconciliation.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/issues/round-record-repository.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/issues/round-record-retention.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/round-record-retention.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/round-record-search-rebuild.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/main/issues/round-record-text.test.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/issues/round-record-text.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/issues/round-record-transcript-facts.test.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/issues/round-record-transcript-facts.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/main/runtime/orca-runtime-conversation-allocation.test.ts` | untracked.tar.gz | §12.3 热点清理 | 不重放；目标冲突预算为 0 |
| `src/main/runtime/rpc/methods/issues.test.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/main/runtime/rpc/methods/issues.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/preload/api/issue-client-data-api.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/issues/IssueChildren.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/issues/IssueConversationList.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/issues/IssueDetail.test.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/issues/IssueDetail.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/issues/IssueDigest.tsx` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/issues/IssueTimeline.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/issues/IssuesPage.test.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/issues/IssuesPage.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/issues/issue-detail-test-data.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/sidebar/issues/build-issue-rows.test.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/sidebar/issues/build-issue-rows.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/sidebar/issues/build-issue-search-rows.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/components/sidebar/issues/create-local-issue-dialog.test.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/sidebar/issues/create-local-issue-dialog.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/sidebar/issues/issue-row-types.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/sidebar/issues/issue-sidebar.test.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/sidebar/issues/issue-sidebar.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/sidebar/issues/issue-virtual-row.test.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/sidebar/issues/issue-virtual-row.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/components/sidebar/issues/sidebar-root-mode-toggle.tsx` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/issues/issue-activity-client.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-activity-client.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-activity-projection.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-activity-projection.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-activity-read.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-activity-read.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-activity-store.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-activity-store.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-activity-thread-overlay.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-activity-thread-overlay.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-client-data.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；旧 preload/local IPC 数据源由 runtime RPC client 取代 |
| `src/renderer/src/issues/issue-client-data.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；旧 preload/local IPC 数据源由 runtime RPC client 取代 |
| `src/renderer/src/issues/issue-conversation-groups.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/issues/issue-conversation-navigation.test.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/issues/issue-conversation-navigation.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/issues/issue-dashboard-ack.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-dashboard-ack.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-dashboard-client.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-dashboard-client.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-dashboard-event-lease.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-dashboard-overlay.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-dashboard-overlay.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-dashboard-store.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-dashboard-store.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-digest-domain.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-display.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/issues/issue-facts-changed-event.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-mutations.test.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/issues/issue-mutations.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/issues/issue-navigation-history.test.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/issues/issue-navigation.test.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/issues/issue-navigation.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/issues/issue-notification-context.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-notification-context.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-notification-navigation.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-notification-navigation.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-search-domain.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/issue-ui-state.test.ts` | untracked.tar.gz | WP6 | 面向 latest main 的 sidebar/index 与 app-shell 叶子接缝重写/择取 |
| `src/renderer/src/issues/issues-domain-store.test.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/renderer/src/issues/issues-domain-store.ts` | untracked.tar.gz | WP5 | 只在 latest main 目标接缝择取；禁止恢复旧 IPC/stream/runtime-core 方案 |
| `src/renderer/src/issues/legacy-activity-migration.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/legacy-activity-migration.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/legacy-activity-pane-routes.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/legacy-activity-source-entries.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/legacy-activity-source-entries.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/local-issue-facts-subscription.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/local-issue-facts-subscription.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/round-record-preview-presentation.ts` | untracked.tar.gz | WP3 | 按 snapshot/live、bounded preview、dedupe/auto-reopen 目标择取 |
| `src/renderer/src/issues/use-issue-activity-timeline.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/use-issue-activity-timeline.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/use-issue-dashboard-snapshot.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/renderer/src/issues/use-legacy-activity-migration.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/issues/attention.test.ts` | untracked.tar.gz | WP1 | 按 v1 契约收缩后重写/择取，禁止整块重放 |
| `src/shared/issues/attention.ts` | untracked.tar.gz | WP1 | 按 v1 契约收缩后重写/择取，禁止整块重放 |
| `src/shared/issues/authority-schemas.ts` | untracked.tar.gz | WP1 | 按 v1 契约收缩后重写/择取，禁止整块重放 |
| `src/shared/issues/client-data.ts` | untracked.tar.gz | WP1 | 按 v1 契约收缩后重写/择取，禁止整块重放 |
| `src/shared/issues/constants.test.ts` | untracked.tar.gz | WP1 | 按 v1 契约收缩后重写/择取，禁止整块重放 |
| `src/shared/issues/constants.ts` | untracked.tar.gz | WP1 | 按 v1 契约收缩后重写/择取，禁止整块重放 |
| `src/shared/issues/digest-constants.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/issues/digest-schemas.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/issues/digest-types.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/issues/hierarchy.test.ts` | untracked.tar.gz | WP1 | 按 v1 契约收缩后重写/择取，禁止整块重放 |
| `src/shared/issues/hierarchy.ts` | untracked.tar.gz | WP1 | 按 v1 契约收缩后重写/择取，禁止整块重放 |
| `src/shared/issues/index.ts` | untracked.tar.gz | WP1 | 按 v1 契约收缩后重写/择取，禁止整块重放 |
| `src/shared/issues/issue-top-level-view.test.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/issues/mobile-schemas.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/issues/mobile-types.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/issues/notification-types.ts` | untracked.tar.gz | §13 / 半态清理 | 不重放；从发布路径、菜单、服务、RPC、后台注册和死代码中删除 |
| `src/shared/issues/schemas.ts` | untracked.tar.gz | WP1 | 按 v1 契约收缩后重写/择取，禁止整块重放 |
| `src/shared/issues/types.ts` | untracked.tar.gz | WP1 | 按 v1 契约收缩后重写/择取，禁止整块重放 |
