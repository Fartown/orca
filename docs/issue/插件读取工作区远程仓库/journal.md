---
title: '插件读取工作区远程仓库'
slug: '插件读取工作区远程仓库'
status: done
created: 2026-11-04
updated: 2026-11-04
external_ids: []
---

# 插件读取工作区远程仓库开发 Journal

## 1. 关键文档链接

| 类型     | 文档                                           | 状态      | 说明                               |
| -------- | ---------------------------------------------- | --------- | ---------------------------------- |
| 需求     | [需求](requirements/插件读取工作区远程仓库.md) | ready     | REQ-2201～REQ-2204                 |
| 方案     | [方案](solutions/远程仓库字段.md)              | ready     | 数据来源、接口形状、脱敏与执行位置 |
| 测试用例 | [用例](tests/cases/远程仓库字段.md)            | ready     | 自动化与本地、SSH 真机（开发插件） |
| 测试记录 | [2026-11-04](tests/runs/2026-11-04.md)         | completed | 两轮真机：第一轮发现 SSH 缺口      |

## 2. 决策点记录

- 2026-11-03：用户要用插件在 Orca 里看自建代码平台的 MR 和 diff，确认公开 fork 只放通用机制、平台接入做成插件。插件要知道工作区对应平台上的哪个仓库；SSH 工作区的插件 worker 无法在主机上执行 git，因此由 Orca 交出它已记录的远程。
- 2026-11-03：第一次开工时发现已发布的 fork/integration 还是早期插件接口，新的插件能力在尚未推送的上游同步里；删掉旧基线上的 worktree，等同步推送后（2026-11-04，663841612a）重新开工。
- 只给已有结果加可选字段，不新增方法、不提升小版本号：不占用上游下一个小版本号，同步时不会撞号。
- 未知时不出现字段，而不是 `null`：现有插件与现有测试看到的结果不变。
- URL 用已有的 `stripCredentialsFromMessage` 去掉凭据；SSH 的 `git@` 保留。
- 只读 Orca 已有的仓库记录，不新增 git 读取、网络请求或主机连接。
- 2026-11-04：第一轮真机验证发现 orcad 托管的 SSH 工作区（当前默认）`readContext` 为 `null`、`workspace.list` 为空：插件宿主只问客户端主进程的 runtime，而这类工作区归 SSH 主机上的 orcad 管。这是上游插件接口原有的缺口，上游 main 也没有处理。给用户三个方案（只补聚焦工作区 / 连列表一起补 / 先合本地版本），用户选定方案 1：本机 runtime 认不出聚焦工作区时，沿用已有的「主进程问窗口」通道读窗口里的记录；`workspace.list`、`agents.list`、`terminal.sendText` 不动。
- `plugin-host-api.ts` 改动前已有 299 行有效代码，加字段后超过 300 行上限；仓库规定超限只能拆分、豁免名单只减不增。不拆上游文件，改为去掉一行等价别名 `workspaceReadContextResult`，行为不变。

## 3. 开发记录

### 2026-11-04 testing

- 本轮目标：插件在本地和 SSH 工作区都能拿到所属仓库的远程地址，且不含凭据。
- 完成内容：新增功能模块 `src/shared/plugin-workspace-remote/`；`readContext`、`workspace.changed`、`workspace.list` 带上可选 `remote`；重新生成参考文档、插件类型声明与技能参考。
- 代码或文档变更：功能目录、七个插件宿主接缝、六个生成文件、注册表、架构策略、`.gitignore` 放行与本功能文档。
- 验证证据：新增 2 个测试文件 13 项通过；撤掉委托层接缝后 readContext 用例失败；现有插件相关 199 个测试文件 1331 项不改动通过；`pnpm tc` 通过。真机验证进行中。
- 未解决问题：本地与 SSH 真机验证尚未完成。
- 下一步：完成真机验证与全部门禁，提 PR 合入 fork/integration。

### 2026-11-04 done

- 本轮目标：补上 orcad 托管 SSH 工作区的 `readContext` 与 `workspace.changed`，完成本地与 SSH 真机验证。
- 完成内容：窗口请求通道加 `read-focused-workspace`；窗口按 `activeWorktreeId` 交出工作区记录与去掉凭据的远程，主进程校验后投影成插件上下文（终端为空）；只在 `readContext` 与 `readPluginWorkspaceChange` 两处兜底。需求、方案、测试用例改为如实描述 SSH 行为与 `workspace.list` 的限制。
- 代码或文档变更：新增 `src/main/plugin-workspace-remote/plugin-focused-workspace.ts`、`src/renderer/src/plugin-workspace-remote/plugin-focused-workspace.ts` 及各自测试；新增接缝 `plugin-view-protocol.ts`、`plugin-view-reply-schema.ts`、`plugin-host-renderer-actions.ts`、`plugin-view-request-handler.ts`，`plugin-host-method-bindings.ts` 与 `plugin-runtime-binding.ts` 各加一处兜底；注册表、架构策略同步。
- 验证证据：见 [测试记录](tests/runs/2026-11-04.md)；真机证据在主仓库 `.docs/plugin-workspace-remote-ui-validation/2026-11-04/evidence/round2/`。
- 未解决问题：orcad 托管的 SSH 工作区不出现在 `workspace.list`，`agents.list`、`terminal.sendText` 也看不到它（上游原有行为，用户选定不在本功能处理）；无界面服务里 SSH 工作区的 `readContext` 仍为 `null`。
- 下一步：提 PR 合入 fork/integration；之后在私有仓库开发自建代码平台插件。

### 2026-11-21 同步后真机发现 SSH 工作区丢 remote，已修（testing）

- 本轮目标：修复同步后 orcad 托管的 SSH 工作区在 `workspace.readContext` 与 `workspace.changed` 里没有 `remote` 的回归。
- 完成内容：真机复验（`/Users/bytedance/dev/orca/.docs/upstream-sync-ui-validation/2026-11-21/plugin-remote/README.md`）本机 3 例通过，SSH「HTTPS 带令牌」与「SSH/本地来回切换」失败。原因：上游新增的 `resolveRemoteWorkspaceContext`（`active-worktree-context-fallback.ts`）让主进程对远端工作区也用持久化行拼出非空上下文，fork 原先只在上下文为空时问窗口，被绕过；而 remote 只在主进程运行时的仓库列表里查，SSH 托管的仓库不在其中。修法：`plugin-focused-workspace.ts` 新增 `withPluginFocusedWorkspaceRemote`，上下文缺 remote 时取窗口对同一 worktree 的记录补上（worktreeId 不同、窗口无答复都不补）；readContext 走新的 `resolvePluginReadContext`，`workspace.changed` 在 `readPluginWorkspaceChange` 里同样补齐。插件收到的内容仍不含凭据。
- 代码或文档变更：`src/main/plugin-workspace-remote/plugin-focused-workspace.ts`、`plugin-focused-workspace.test.ts`（新增「主进程有持久化上下文但无仓库记录」两例）；接缝 `plugin-host-method-bindings.ts` 的 mustContain 改为 `await resolvePluginReadContext(context, terminals, services.renderer)`，新增 `plugin-runtime-binding.ts` 接缝 `await withPluginFocusedWorkspaceRemote(context, renderer)`。
- 验证证据：`src/main/plugin-workspace-remote`、`src/main/plugins`、`src/shared/plugin-workspace-remote` 55 文件 157 项通过；`pnpm tc:node`、`check:fork-features`、`check:architecture-policies` 通过。
- 未解决问题：修复后尚未在真机 SSH 场景复跑 6 项场景脚本。
- 下一步：用 `/Users/bytedance/dev/orca/.docs/upstream-sync-ui-validation/2026-11-21/plugin-remote/scripts/` 的脚本复跑 SSH 两例。

### 2026-11-21 上游同步到 fa60d0a566（done）

- 本轮目标：`fork/integration` 从 `e723de1bfd` 合入上游到 `fa60d0a566`（四次合并：`22afb84f6a`、`9c3b42f644`、`d725f407e8`、`31df22fb1a`，冲突都在第一次），保持插件读工作区时带出远程仓库信息、焦点不在本机运行时时向外查询。
- 完成内容：本功能 15 个冲突（UU 12、UD 3）。上游把插件宿主 API 拆进 `src/main/plugins/workers/host-api/` 与 `src/main/plugins/runtime/`：`plugin-runtime-binding.ts`（UD）移植到 `plugins/runtime/`，适配上游 `readPluginWorkspaceChange` 改为返回 `{change, worktreeId}`；`plugin-workspace-projection.ts`（UD）移植到 `host-api/`；`plugin-host-workspace-method-bindings.ts`（UD）的工作区列表移到 `host-api/plugin-host-workspace-list.ts`，接缝文本改为 `pluginWorkspaceRemoteForRepo(repoRows, worktree.repoId)`；`plugin-host-method-bindings.ts` 的 readContext 分支改为 `: await readPluginFocusedWorkspaceElsewhere(services.renderer)`。`plugin-host-api.ts` 的 schema 被上游挪到 `plugin-host-api-workspace-context.ts`，fork 的 remote 字段移植过去；frame 调 readContext 多了一层上游 `pluginFrameWorkspaceContext` 投影，`workspaceId` 被去掉、remote 保留。两个自有测试跟上游新接口改：`listAgentTasksByPaneKey` 成为 delegate 必填，worker 侧 context 新增 `workspaceId`，远端 remote 断言不变。插件生成物 `resources/plugins/declarative/orca-testing.mjs`、`orca.d.ts`、`types/orca-host.d.ts`、插件编写参考 `events.md`/`host-api.md` 与 `src/cli/skills/bundled-skill-guides.ts` 按生成器重新生成。
- 代码或文档变更：`config/fork-features.jsonc` 接缝 20 条：7 条换路径，2 条随文件拆分换 mustContain（`plugin-host-workspace-list.ts`、`plugin-host-method-bindings.ts`）；`dependsOn` 7→8 条（`worktree-repo-index.ts` 换成 `worktree-catalog-index.ts`，`workspace-record-selectors.ts` 换成 `workspace-record-fields.ts`，新增自有测试用的 `host-api/plugin-host-runtime-call.ts`）。合并后没有本功能的单独修复提交。新棘轮基线未登记本功能条目。
- 验证证据：登记 checks 82 文件 226 项通过（`/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/sync-checks-run3.log`）；冲突解法见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/report-F-builds-plugins-goals.md`、`phase2-F.tsv`、`decisions.tsv`；最终门禁见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/final-gates.log`。真机抽查为 BLOCKED：需要装开发插件并订阅 `workspace.changed` 的 6 项场景脚本（2026-11-04 的脚本在 `.docs/plugin-workspace-remote-ui-validation/`），本轮没有重建（`/Users/bytedance/dev/orca/.docs/upstream-sync-ui-validation/2026-11-21/README.md` 第 9b 项）；本机与 SSH 都只有单测。
- 未解决问题：窗口回退时 `worktreeId` 为 null（本机运行时不拥有焦点工作区）的分支没有测试覆盖；同步后没有真机验证插件拿到的 remote。
- 下一步：用 2026-11-04 的 6 项场景脚本在本机与 SSH 重跑一遍。
