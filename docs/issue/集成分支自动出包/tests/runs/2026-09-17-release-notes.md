---
title: 发布说明列出本次合入与版本号兼容验证
document_type: test-run
status: completed
created: 2026-09-17
updated: 2026-09-17
---

# 发布说明列出本次合入与版本号兼容验证

- 关联：REQ-406、REQ-407；TC-407、TC-408。
- 分支：`feat/integration-builds-release-notes`，基于 `fork/integration` 3e83a774f。
- 执行人：Claude Code。没有创建、修改或删除任何 GitHub 发布；没有启动、退出或替换正在使用的 Orca。

## 已执行

| 验证 | 实际结果 | 边界 |
| --- | --- | --- |
| 红绿回归 | 新用例放到旧实现上 9 项失败（合入列表、回退、标题截断、preview 版本、合入列表解析、更新提示文案），新实现 60 项全部通过；这三个测试文件改动前为 49 项 | 控制 `gh`、`git` 与 HTTP 响应 |
| 功能检查 | 登记的桌面侧检查 9 个文件 101 项、移动端 `src/integration-builds` 19 项通过 | 不含真机 |
| 原更新器回归 | `src/main/updater*`、`updater-changelog`、更新卡片组件等 26 个文件 294 项通过 | 更新卡片组件未改动 |
| 真实发布记录预演 | 用 fork 的真实发布列表与本地集成分支历史运行发布脚本，创建、上传、编辑发布三步只记录不执行，结果见下表 | 预演用的 `ORCA_LOCAL_BUILD_VERSION` 与签名证据是按旧格式临时生成的 |
| 发布任务检出方式 | 按新检出方式（全部历史、不含文件内容）从公开 fork 拉取：3 秒、36 MB；`merge-base --is-ancestor` 与第一父提交日志可用，没有按需下载任何文件内容 | 在本机网络执行，不代表 GitHub runner 的耗时 |
| 类型与门禁 | 根 `pnpm tc`、移动端 `typecheck`、改动文件 `oxlint`、按 PR 基线的变更代码质量门禁、`check:fork-features`、本地化三项通过 | 见下方架构门禁说明 |

真实发布记录预演（发布说明里的条目）：

| 场景 | 提交与构建 | 对比的上一个集成包 | 列出的条目 |
| --- | --- | --- | --- |
| 单个 PR | 3e83a774f79f，run 35169245036 | integration-35167233277-b575af7cbbb7 | #30 feat(self-hosted-artifacts): 局域网分享，由文件所在电脑上的 Orca 提供链接 |
| 同步上游 | 1f4e752132e8，run 35044255962 | integration-35040059221-05ce5f3abbdb | Merge remote-tracking branch 'upstream/main' into fork/integration（同一区间共 56 个提交，上游提交未逐条列出） |
| 两次发布之间有两个提交 | 2b4e6db1ecc4，run 34763524837 | integration-34730775743-da37cd3ccb50 | fix(session-names): give the file-chain e2e program electron's types；Merge upstream stablyai/orca into fork/integration |
| 同一提交再次出包 | 3e83a774f79f，假设 run 35169245037 | 跳过同提交的 integration-35169245036，对比 b575af7cbbb7 | #30 同上 |

## 架构门禁

默认基线（本机刚拉取的 `origin/main`）报 1 条：`src/main/runtime/rpc/errors.ts` reference-drift。本分支没有改这个文件；在干净的 `fork/integration`（3e83a774f）上同样报这一条，原因是上游 a01027697 在 fork 同步点 a9232e8db 之后给该文件加了 3 行。按 fork 实际同步到的上游基线 `--base Fartown/main` 运行通过，13 组策略。

变更代码质量门禁：PR #31 第一次 CI 的 static analysis 报 3 条类型断言，都在本次改动的行上（测试里新加的更新器替身、解析函数的返回行）。修复方式：`pinIntegrationReleaseFeed` 的参数只要求用到的四个更新器成员，测试直接传普通对象；合入列表不再在解析时改写返回值，改为 `integrationChanges(release)` 读取时校验，返回行恢复原样。按 PR 基线 3e83a774f 本地重跑五项扫描均为 0 条。

## 合入后核对（#31，0231e645f）

| 验证 | 实际结果 | 边界 |
| --- | --- | --- |
| 自动出包 | run 35175801533 第一次尝试 Intel 打 DMG 时 `getaddrinfo ENOTFOUND github.com` 失败，Apple Silicon 与 Android 成功；重跑 Intel 任务后发布成功（03:23 UTC） | Intel 失败是构建机网络问题，之后按 D-005 去掉 Intel |
| 发布说明 | `integration-35175801533-0231e645f69d` 的「本次合入」列出「#31 feat(integration-builds): 发布说明与更新提示列出本次合入的 PR」，附上一个集成包 `integration-35169245036-3e83a774f79f` 与完整提交差异链接 | 发布任务按新方式检出（全部历史、不含文件内容）在 GitHub 上跑通 |
| 清单 | `build-info.json` 的 `changes` 为 `[{number: 31, …}]`，桌面版本 `1.4.197-local.1789613322600.0231e645f69d` | — |
| 桌面更新 | 通过运行时更新接口（与界面上检查、下载、重启更新同一路径）：03:24:14 检查，3 秒后发现新版本；32 秒下载完成；03:25:12 安装，03:25:59 新主进程启动，运行时报告新版本。终端守护进程未重启，其中的会话未中断 | 用户这台 Mac；旧版本显示的更新提示仍是固定说明（旧代码生成） |

## 未验证

- 更新提示里的合入标题已在 #32 合入后核对（见[常规版本号](2026-09-17-preview-version.md)），读取的是卡片渲染的数据，未截取界面。
- Android 集成包是否已更新。
- 第二步（出包改用 `-preview.N`）尚未实现，本次只让客户端提前兼容。

## 证据

本地完整索引：`.docs/integration-release-notes-ui-validation/2026-09-17/README.md`；桌面更新过程见同目录 `evidence/desktop-update-rpc.log`，调用脚本为 `scripts/orca-updater-rpc.mjs`。
