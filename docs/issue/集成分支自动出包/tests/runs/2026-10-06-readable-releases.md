---
title: 发布页分层与可读发布说明验证
document_type: test-run
status: completed
created: 2026-10-06
updated: 2026-10-06
---

# 发布页分层与可读发布说明验证

- 关联：REQ-407、REQ-408～REQ-412；TC-408～TC-413。
- 分支：`feat/integration-builds-readable-releases`，基于 `fork/integration` 617f48da80。
- 执行人：Claude Code。没有创建、修改或删除任何 GitHub 发布或 tag；没有调用 Anthropic API；没有启动、退出或替换正在使用的 Orca。

## 已执行

| 验证 | 实际结果 | 边界 |
| --- | --- | --- |
| 单测 | `config/scripts/integration-builds` 下 104 项通过，其中新增 `release-notes.test.mjs` 与 `release-lifecycle.test.mjs`；原 `integration-builds.test.mjs` 的合入列表用例迁入新文件，工作流接线新增密钥边界用例 | 控制 `gh`、`git` 与 Claude 客户端 |
| 功能检查 | 登记的桌面侧检查 12 个文件 175 项、移动端 `src/integration-builds` 21 项通过 | 不含真机 |
| 真实历史预演 | `.docs/integration-release-notes-review/2026-10-06/scripts/dry-run.mjs`：用 2026-10-06 保存的 37 个真实构建发布与本地历史运行发布脚本，GitHub 写操作只记录；上游官方 Release 为真实读取。结果见下表 | 预演用的签名证据与 Android versionCode 为临时生成 |
| AI 输入预演 | 同一脚本用假客户端记录 `c986a8309f` 整理版发给 Claude 的请求：10639 字符，含按功能分组的改动、官方 v1.4.218～v1.4.220 的「The short version」与上游新功能提交；模型、回退参数与预期一致 | 没有真实调用，回复质量待用户配置 key 后核对 |
| 类型与门禁 | `pnpm tc`；按 fork 差异基线 `b6c5f3f123` 的变更代码质量（quality、type-aware、React Doctor）与 React Doctor；`check:fork-features`；`check:architecture-policies --base Fartown/main`；本地化三项 | 架构门禁见下方说明 |

## 真实历史预演结果

| 场景 | 版本 | 正文 | 整理版 | 清理 |
| --- | --- | --- | --- | --- |
| `c986a8309f` 同步上游 | `1.4.214-preview.33` | 三个功能组 4 条修复；同步上游（期间官方发布 v1.4.209 至 v1.4.220，1166 个提交）与 11 个官方链接；上游新功能提交折叠；工程改动 6 项折叠 | `fork-v1.4.220-1`，`--latest`，非预发布 | 删除 23 个，保留本次加最近 9 个 |
| `617f48da80` PR #45 | `1.4.214-preview.37` | 「移动端在新会话中继续」组 1 条 (#45)；无同步、无工程改动 | 不发 | 删除 27 个 |
| `617f48da80` 手动整理版 | `1.4.214-preview.37` | 同上 | `fork-v1.4.221-1`，覆盖自最近一次同步（上游 `b6c5f3f123`，期间官方发布 v1.4.221）以来的 6 条用户可见改动与 2 项工程改动 | 删除 27 个 |

产物：`.docs/integration-release-notes-review/2026-10-06/evidence/`（各场景的 `release-notes.md`、`build-info.json`、`milestone-notes.md`、`gh-writes.txt`，以及 `ai-summary-input/`）。

## 预演中发现并修正

1. 上游 Release 列表超出 `execFileSync` 默认 1 MB 输出缓冲（`ENOBUFS`），官方链接整段丢失。改为统一的命令输出上限 256 MB。
2. 同步标题用 main 的 `package.json`（v1.4.197 → v1.4.214），下面却列出到 v1.4.220 的官方发布，互相矛盾。改为只写「期间官方发布」的范围，整理版的上游版本也取官方正式版。
3. 上游新功能提交混有基础设施改动（如 relay 分区声明），改为折叠，正文以官方说明链接为主。
4. 合入后第一次手动整理版既没有上一个整理版、区间里也没有同步，只会覆盖一个 PR，且名字退回 main 的版本。改为第一个整理版从最近一次同步起。

## 架构门禁说明

本机 `origin` 指向上游，`origin/main` 已比集成分支合入的上游多 48 个提交，`issues-existing-capability-reuse` 会把上游改过的 `runtime-rpc-client.ts` 报为偏离；它与本次改动无关。CI 的 `origin` 是 fork，基准为 fork 的上游镜像，所以本机以 `--base Fartown/main` 复现 CI 结果：通过。REQ-412 原计划在本分支改 AGENTS.md 与 fork 维护文档，被 `integration-builds-worktree-scope` 拦下，改为单独的文档 PR。

## 合入后核对

#46 合入为 `e4b5ba8667`。证据在 `.docs/integration-release-notes-review/2026-10-06/evidence/post-merge/`。

| 核对 | 实际结果 |
| --- | --- |
| 推送出包（运行 37433234101） | 发布 `Orca 1.4.214-preview.40`，接在 `preview.39` 之后；正文开头为「这一版变了什么」并列出 #46，安装签名与构建信息折叠；`build-info.json` 的合入列表只有 #46 |
| 清理 | 日志 `Pruned 30 older build release(s)`；Release 页与远端 `integration-*` tag 各剩 10 个 |
| 手动整理版（运行 37437587579，`milestone=true`） | 先发布 `preview.41`，再发布 `fork-v1.4.221-1`「Orca 集成版 1.4.221 · 第 1 版」：非预发布、无安装包、为仓库 Latest。正文从最近一次同步写起：6 个功能组 9 条可见改动、同步上游（期间官方发布 v1.4.221，5 个提交）、工程改动 3 项折叠，安装链接指向 `preview.41`。构建发布仍为 10 个 |
| AI 短版本 | `release-summary` 任务输出 `ANTHROPIC_API_KEY is not set`，无产物；整理版照常发布、不含短版本 |
| 应用内更新检查 | 用 `release-catalog.ts` 对真实 GitHub 检查：桌面与 Android 在 API 正常与强制 403（走 atom 订阅）两种情况下都选中最新构建（`preview.40`，整理版发布后为 `preview.41`），没有选中整理版 |

## 未执行

- 真实 Claude 调用：用户决定暂不测试，待仓库配置 `ANTHROPIC_API_KEY` 后核对。
- 真机上的更新提示与安装：本次用应用自己的更新检查代码对真实 GitHub 验证，没有在用户设备上安装。
