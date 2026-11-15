---
title: 跨版本 Wire 夹具兼容
document_type: requirement
status: ready
created: 2026-11-16
updated: 2026-11-16
---

# 跨版本 Wire 夹具兼容

## 背景与目标

Issue [Fartown/orca#115](https://github.com/Fartown/orca/issues/115) 对应历史 cross-version Wire suite 的 release checkout 路径兼容。历史版本 v1.4.256 已将终端协议文件移至 `src/shared/terminal/stream/terminal-stream-protocol.ts`；发布校验固定检查旧路径，导致已有夹具被误拒。目标是接受同一源码根目录内唯一的同名迁移位置，继续拒绝缺失或歧义。

## 用户场景与范围

- In Scope：开发机和 CI 的历史 release checkout 夹具发布校验与 fork 同步快照候选选择；本地及在 SSH 执行测试机上的同一校验；旧路径、新唯一迁移路径、缺失和歧义的验证。
- Out of Scope：产品终端协议、客户端与远端服务的连接或重连策略、用户 SSH 服务、跳过 suite、共享缓存手工清理。

### REQ-001 唯一路径迁移和执行机归属

当前状态：已实现（本地四文件21条、SSH执行机两文件12条通过，见 TC-001～TC-003；CI待合入检查）。

发布校验应接受历史 checkout 中仍存在的旧路径，或由既有 `releaseModuleLocation` 唯一定位到的同名新路径；若解析后文件不存在或同名候选不唯一，应拒绝发布，不掩盖 fixture 缺失。

本地运行时，Git checkout、缓存、临时路径和校验进程均归本地执行测试机。经 SSH 在另一台测试机执行时，上述资源均归该执行测试机；`127.0.0.1` 若被测试工具使用也指该机。功能不连接、读取或修改用户的 SSH 服务，不创建新 RPC、后台重试、环境变量或配置写入。Folder workspace、移动端和远程用户主机不参与此测试夹具校验。

### REQ-002 本地与 CI 使用同一 fork 同步快照候选池

当前状态：已实现（TC-004～TC-006；本地及SSH登记检查各33条通过，默认完整跨版本目录226条通过；PR最终门禁与CI待完成）。

当仓库已配置指向 `Fartown/orca` 的 remote 时，默认 baseline 与 recent release 均从稳定桌面标签中选择，且标签 `creatordate` 不晚于 `git merge-base HEAD origin/main` 的提交时间；相等允许。不得使用 `--merged HEAD` 过滤，因早于快照的固定 writer 标签仍可能不是当前分支祖先。缺少 `origin/main` 或 merge-base 应明确失败，不静默回退全局最新版。

上游仓库继续从全部稳定桌面标签选择，不受 fork 快照限制。显式 `ORCA_CROSS_VERSION_BASELINE_REF` 与 daemon gate 的 `--release-ref` 保持直通，可继续对 v1.4.256 等较新版本做真实兼容验证，失败仍报红。CI 既有 fetch 与删除超快照标签步骤可保留；本地选择不得依赖其副作用。

本地运行时标签、Git 历史和缓存归本地测试执行机；SSH 测试运行时归 SSH 测试执行机。选择器只读取该执行机的已配置 remote、`origin/main`、merge-base 和标签元数据；不读取或连接用户 SSH 服务，不自行 fetch、重试或改写 Git 仓库。

## 验收标准

- 旧路径与唯一迁移路径均可通过 checkout 发布校验；缺失和同名歧义被拒绝，错误仍指出终端协议缺失。
- 两个历史 cross-version Wire suite 在 v1.4.256 真正执行通过，不降低版本、不跳过用例。
- 本地和 SSH 测试机均在各自执行机上创建与清理测试夹具，不触碰用户 SSH 服务或共享缓存。
- fork 默认 baseline 与 recent 使用相同快照候选池：快照前的非祖先 v1.4.245 可选，快照后的 v1.4.256 不可默认选；相等时间可选，RC 与无效标签排除，候选不足和无快照均明确失败。
- 上游仓库仍用全局最新稳定版本；显式指定 v1.4.256 仍按原行为执行，不掩盖真实兼容失败。

## 来源与未决问题

- 已确认来源：当前任务授权及 Issue #115；现有 `releaseModuleLocation` 的唯一 basename 迁移规则。
- 未决问题：本地与SSH登记检查各4文件33条、显式v1.4.256两套历史suite各9条通过；默认完整跨版本目录52文件226条通过。PR 的最终门禁与 CI 尚待完成。

## 需求变更记录

- 2026-11-16：首次登记 REQ-001，限定为测试夹具兼容。
- 2026-11-16：新增 REQ-002，使本地默认候选与 CI 的 fork 同步快照契约一致；显式较新版本测试保留。
