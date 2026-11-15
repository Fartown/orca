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

- In Scope：开发机和 CI 的历史 release checkout 夹具发布校验；本地及在 SSH 执行测试机上的同一校验；旧路径、新唯一迁移路径、缺失和歧义的验证。
- Out of Scope：产品终端协议、客户端与远端服务的连接或重连策略、用户 SSH 服务、发布版本选择、跳过 suite、共享缓存手工清理。

### REQ-001 唯一路径迁移和执行机归属

当前状态：已实现（本地四文件21条、SSH执行机两文件12条通过，见 TC-001～TC-003；CI待合入检查）。

发布校验应接受历史 checkout 中仍存在的旧路径，或由既有 `releaseModuleLocation` 唯一定位到的同名新路径；若解析后文件不存在或同名候选不唯一，应拒绝发布，不掩盖 fixture 缺失。

本地运行时，Git checkout、缓存、临时路径和校验进程均归本地执行测试机。经 SSH 在另一台测试机执行时，上述资源均归该执行测试机；`127.0.0.1` 若被测试工具使用也指该机。功能不连接、读取或修改用户的 SSH 服务，不创建新 RPC、后台重试、环境变量或配置写入。Folder workspace、移动端和远程用户主机不参与此测试夹具校验。

## 验收标准

- 旧路径与唯一迁移路径均可通过 checkout 发布校验；缺失和同名歧义被拒绝，错误仍指出终端协议缺失。
- 两个历史 cross-version Wire suite 在 v1.4.256 真正执行通过，不降低版本、不跳过用例。
- 本地和 SSH 测试机均在各自执行机上创建与清理测试夹具，不触碰用户 SSH 服务或共享缓存。

## 来源与未决问题

- 已确认来源：当前任务授权及 Issue #115；现有 `releaseModuleLocation` 的唯一 basename 迁移规则。
- 未决问题：本地/SSH 单测及两个 v1.4.256 历史 suite 已执行通过，PR 的最终门禁与 CI 尚待完成。

## 需求变更记录

- 2026-11-16：首次登记 REQ-001，限定为测试夹具兼容。
