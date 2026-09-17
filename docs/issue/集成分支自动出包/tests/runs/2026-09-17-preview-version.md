---
title: 集成包常规版本号验证
document_type: test-run
status: completed
created: 2026-09-17
updated: 2026-09-17
---

# 集成包常规版本号验证

- 关联：REQ-407；TC-408。
- 分支：`feat/integration-builds-preview-version`，基于 REQ-406 分支 bf6b51988。按 D-004 暂不合入。
- 执行人：Claude Code。没有创建、修改或删除任何 GitHub 发布；没有启动、退出或替换正在使用的 Orca。

## 已执行

| 验证 | 实际结果 | 边界 |
| --- | --- | --- |
| 功能检查 | 登记的桌面侧检查 9 个文件 109 项、移动端 `src/integration-builds` 19 项通过 | 新测试文件依赖新增模块，没有逐项放到旧实现上做红灯对照 |
| 编号与发布复核 | 编号跨分页只统计已发布的集成包；上游版本带预发布后缀、已发布数非法时失败；编号被占用、没有已发布包却编号为 2、已有更新的构建发布三种情况都拒绝发布且不写发布；旧格式版本和非法 Android versionCode 在任何 GitHub 调用前被拒绝 | 控制 `gh`、`git` 响应 |
| 工作流接线 | 身份任务带只读令牌；发布任务带版本号与 Android versionCode，检出全部历史、不含文件内容 | 解析工作流文件，未在 GitHub 上运行 |
| 真实发布记录预演 | fork 已发布 23 个集成包，下一个为 `1.4.197-preview.24`；用该编号运行发布脚本，记录到标题「Orca 1.4.197-preview.24」及上传、编辑两步，`latest-mac.yml` 版本一致；用 `1.4.197-preview.23` 运行被拒绝（23 builds are already published），没有任何写发布的调用 | 写发布的三步只记录不执行；合入 REQ-406 后已发布数会增加 |
| 版本比较 | 与最新已发布的 `1.4.197-local.1789607195626.3e83a774f79f` 相比，electron-updater 的 `semver.gt` 与 Orca 的 `compareAppVersions` 都判定 `1.4.197-preview.24` 更新；`1.4.198-preview.25` 高于 `1.4.197-preview.24`；`preview.10` 高于 `preview.9` | 比较函数的判定，不等于真实安装 |
| 门禁 | 改动文件 `oxlint`、相对 REQ-406 分支的变更代码质量门禁（五项 0 条）、`check:fork-features`、按 `--base Fartown/main` 的架构门禁通过 | 默认基线的 `errors.ts` 漂移见 REQ-406 测试记录 |

## 去掉 Intel 出包（D-005）

| 验证 | 实际结果 | 边界 |
| --- | --- | --- |
| 发布内容 | 清单资产为 Apple Silicon DMG、ZIP、APK 与 Intel 占位说明；`latest-mac.yml` 只列 Apple Silicon ZIP；发布说明写明 Intel 版已停止、占位文件不是安装包 | 控制 `gh`、`git` 响应 |
| 旧集成包兼容 | 旧集成包判断 Mac 发布完整所需的 `build-info.json`、`latest-mac.yml`、两个架构的 ZIP 都在上传列表里；占位文件的大小与清单记录一致 | 按旧代码的要求列表断言，未用旧版应用实际检查 |
| 占位 ZIP | `unzip -t` 通过，内容为说明文字（380 字节） | — |
| 功能检查 | 桌面侧 9 个文件 110 项、移动端 19 项通过 | — |

## 未验证

- 合入后第一个 `-preview.N` 集成包的真实发布，以及桌面与 Android 集成包从旧格式更新到新格式的实际安装。
- 合入前提：用户确认桌面与 Android 集成包都已更新到含 REQ-406 的版本。

## 证据

本地完整索引：`.docs/integration-preview-version-ui-validation/2026-09-17/README.md`。
