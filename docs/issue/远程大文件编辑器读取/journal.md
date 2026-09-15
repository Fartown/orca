---
title: "远程大文件编辑器读取"
slug: "远程大文件编辑器读取"
status: testing
created: 2026-09-15
updated: 2026-09-15
external_ids: []
---

# 远程大文件编辑器读取 开发 Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [requirements/远程大文件编辑器读取.md](requirements/远程大文件编辑器读取.md) | ready | REQ-701～REQ-704 |
| 交互 | - | not-required | 无新 UI；成功路径就是文件正常打开 |
| 调研 | - | not-required | 链路在 `runtime-file-read-client.ts` 内闭合，成因见 D-201 |
| 方案 | - | not-required | 复用既有 `files.readChunk`，要点记在 D-201、D-202 |
| 测试用例 | [tests/cases/远程大文件编辑器读取功能测试.md](tests/cases/远程大文件编辑器读取功能测试.md) | ready | TC-701～TC-707 |
| 测试记录 | [tests/runs/2026-09-15-分块补读单元验证.md](tests/runs/2026-09-15-分块补读单元验证.md) | completed | TC-701～TC-707 通过 |

## 2. 决策点记录

### D-202 上限取 10 MiB，与 SSH 对齐

- 日期：2026-09-15
- 背景：本地 IPC 文本上限 50 MiB，SSH 流式读取文本上限 10 MiB，配对 runtime 此前实际是 512 KiB
- 最终决定：10 MiB
- 原因：配对 runtime 与 SSH 同属远程传输，且分块内容是 base64，50 MiB 会变成约 67 MiB 过网；10 MiB 已覆盖用户报告的场景（600 KB）两个数量级
- 影响范围：REQ-704

#### 备选项

- 50 MiB（与本地 IPC 对齐）
- 10 MiB（与 SSH 对齐）
- 不设上限

#### 关联文档与需求点

- [需求 REQ-704](requirements/远程大文件编辑器读取.md)

### D-201 复用 files.readChunk，不动 files.read 的预览预算

- 日期：2026-09-15
- 背景：`files.read` 预览尺寸，超预算返回 `truncated`；主机侧 `files.readChunk` 早已存在并被下载路径使用
- 最终决定：truncated 时改由 `files.readChunk` 补读，`files.read` 的预算保持不变
- 原因：不新增方法或字段就不触发 `remote-wire-compatibility.md` 的协商要求；`files.read` 服务的是预览，放大它会让每一次预览都付出大文件的代价
- 影响范围：REQ-701、REQ-703，seam `runtime-file-read-client.ts`

#### 备选项

- 放大 `files.read` 的预览预算
- 新增一个「整份读取」RPC
- 复用既有的 `files.readChunk`

#### 关联文档与需求点

- [需求 REQ-701](requirements/远程大文件编辑器读取.md)、[docs/reference/remote-wire-compatibility.md](../../reference/remote-wire-compatibility.md)

## 3. 开发记录

### 2026-09-15 分块补读落地

- 本轮目标：配对 runtime 上超出预览预算的文件能在编辑器里正常打开。
- 完成内容：新增功能自有模块 `src/renderer/src/runtime-large-file/assemble-runtime-file-chunks.ts`（连续分块读取、一次性 UTF-8 解码、上限与停滞保护）；`runtime-file-read-client.ts` 在 `truncated` 时改调它；主机过旧（`method_not_found`）时保留失败但提示补救办法；登记 fork 功能条目、架构策略与 `.gitignore` 放行。
- 代码或文档变更：`src/renderer/src/runtime-large-file/**`；`src/renderer/src/runtime/runtime-file-read-client.ts`、`src/renderer/src/runtime/runtime-file-client.test.ts`；`config/fork-features.jsonc`、`config/architecture-policies.jsonc`、`.gitignore`；本 issue 全部文档。
- 验证证据：`pnpm exec vitest run src/renderer/src/runtime-large-file src/renderer/src/runtime/runtime-file-client.test.ts` → 2 文件 28 用例通过；`pnpm tc`、`oxlint`、三项 `verify:localization-*`、`check:architecture-policies`、`check:fork-features`、`check:fork-docs` 通过；`check:code-quality:changed` 为 319 项，与分支基线逐项相同，未新增。
- 未解决问题：无真机证据——复现需要一台配对 runtime 主机和一个超过 512 KiB 的文件，本轮只做了单元覆盖，已在测试记录里如实标注。
- 下一步：跑完门禁，提 PR 合回 `fork/integration`。
