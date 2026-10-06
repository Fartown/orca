---
title: "移动端上传任意文件"
slug: "移动端上传任意文件"
status: implementing
created: 2026-10-06
updated: 2026-10-06
external_ids: []
---

# 移动端上传任意文件 开发 Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [requirements/移动端上传任意文件.md](requirements/移动端上传任意文件.md) | ready | REQ-001~006：入口、落到工作区所在机器、交给终端或 agent、100 MiB、新旧版本组合、临时文件清理 |
| 交互 | - | not-required | 沿用现有底部菜单与附件按钮，无独立设计稿 |
| 调研 | [research/移动端附件上传现状与技术链路.md](research/移动端附件上传现状与技术链路.md) | ready | 两种会话页形态、选择器、上传与落盘、目标机器判定、交付方式、版本兼容 |
| 方案 | [solutions/移动端文件附件上传方案.md](solutions/移动端文件附件上传方案.md) | reviewing | 新 RPC `fileAttachment.*` 流式写入目标机器临时目录；手机壳新接口 `native.file.*`；图片旧通道保留 |
| 测试用例 | - | pending-decision | 实现落地后编写 |

## 2. 决策点记录

### D-005 移动端放行用 fork 自有名单，不改上游白名单文件

- 日期：2026-10-06
- 背景：上游 `runtime-rpc-mobile-method-allowlist.ts` 恰好 300 个有效行（`max-lines` 上限），且 `mobile-rpc-allowlist.test.ts` 按字面量解析该文件；加任何一个方法都会让提交钩子失败，而仓库规则禁止放宽 `max-lines`
- 备选项：
  1. 把 4 个方法合成 1 个带操作字段的方法：仍超 1 行
  2. 拆分上游白名单文件：改动大，每次上游同步都会冲突
  3. 新建 fork 自有名单，分发处同时认两个名单，测试同时读两个文件
- 最终决定：采用 3
- 原因：上游白名单保持逐字一致；fork 侧只有分发处一行判断和测试里读文件的一处是接缝；以后 fork 功能的移动端方法都登记在同一处
- 影响范围：REQ-001；方案 §4.5、§8

### D-004 新增专用 RPC，不扩展剪贴板图片接口、不开放通用文件写入

- 日期：2026-10-06
- 背景：手机要把任意文件写到工作区所在机器的临时目录，且主机不能把整个文件放进内存
- 备选项：
  1. 给 `clipboard.*Upload` 加可选文件名：旧主机会静默丢掉该字段，把 PDF 存成 `.png`，违反兼容规则
  2. 对手机开放 `files.writeBase64Chunk`：只能写进工作区目录，没有槽位、过期与失败清理，且等于开放通用二进制写权限
  3. 新增 `fileAttachment.startUpload / appendUploadChunk / commitUpload / abortUpload`
- 最终决定：采用 3
- 原因：旧主机对未知方法明确拒绝，手机能识别并给出「需要更新」；目标机器、目录、命名、清理全由电脑端决定，以后调整不需要升级手机
- 影响范围：REQ-002、REQ-004、REQ-005、REQ-006；方案 §4

### D-003 单文件上限 100 MiB，电脑端边收边写

- 日期：2026-10-06
- 背景：现有图片通道上限约 18 MiB，且主机把整个文件留在内存里
- 备选项：沿用 18 MiB；提高到 100 MiB 并改为流式写入
- 最终决定：100 MiB，流式写入（用户确认）
- 原因：覆盖大多数 PDF、压缩包和日志
- 影响范围：REQ-004；网页版会话页需要手机壳新接口才能超过 18 MiB（方案 §6）

### D-002 附件按钮点按弹出「照片 / 文件」

- 日期：2026-10-06
- 背景：终端输入栏现在是点按相册、长按文件，长按几乎无人发现；聊天输入框没有文件入口
- 备选项：保持现有手势；点按弹出选择
- 最终决定：点按弹出选择，终端与聊天一致（用户确认）
- 原因：入口可发现，两个输入框行为一致
- 影响范围：REQ-001

### D-001 文件放主机临时目录并保留原名

- 日期：2026-10-06
- 背景：文件需要落在 agent 能读到的机器上
- 备选项：主机临时目录；工作区内固定目录；两者都做（另加文件面板上传）
- 最终决定：主机临时目录，保留原文件名，不进工作区（用户确认）
- 原因：不污染 `git status`，用途是交给 agent 或终端
- 影响范围：REQ-002、REQ-006；Q-2（工作目录外文件的权限确认）待真机验证

## 3. 开发记录

### 2026-10-06 电脑端上传接口与手机端入口

- 本轮目标：实现电脑端 `fileAttachment.*` 流式写入，以及手机端「照片 / 文件」入口、上传与交付
- 完成内容：电脑端按工作区判定目标机器（与终端启动同一规则），边收边写入本机或 SSH 主机的 `orca-file-attachments` 临时目录，带槽位归属、偏移校验、5 分钟空闲过期、失败清理与 7 天保留期清扫；手机端附件按钮改为弹出「Photo / File」，原生会话页用系统文档选择器分块读取，网页版会话页先走现有 `native.media.*`（约 18 MiB、名字按类型生成）；终端插入转义路径或图片粘贴，聊天输入框插入 `@路径` 或加入待发图片；旧电脑端只放行可作为附件的图片，其余提示更新
- 代码或文档变更：`src/shared/file-attachment-upload/**`、`src/main/file-attachment-upload/**`、`src/main/runtime/rpc/methods/file-attachment-upload*.ts`、`src/renderer/src/file-attachment-upload/**`、`mobile/src/file-attachment-upload/**`；接缝见方案 §8 与 `config/fork-features.jsonc`
- 验证证据：电脑端 `file-attachment-upload.test.ts` 16 例（本机、SSH 假文件系统、文件夹工作区、Windows 远端路径、断连、清扫、归属、偏移、并发、过期）与共享模块 13 例通过；`src/main/runtime/rpc` 全量 352 个测试文件通过；手机端功能 24 例通过，手机端全量 944 个测试文件中与本功能相关的 4 个已修复；`pnpm tc`、手机端 `typecheck`、`check:runtime-electron-ratchet`、`verify:rpc-params-catalog`、`check:fork-features`、`check:fork-docs`、`check:architecture-policies --base Fartown/main` 通过
- 未解决问题：手机端 `terminal-webview-payload-hash.test.ts` 在本机失败，原因是本机手机端依赖未随 4 天前的锁文件更新，与本功能无关；`check:tests-typecheck` 报 3 个「移动端续接会话」测试文件，同为既有问题；网页版会话页还没有原名与 100 MiB
- 下一步：手机壳新增 `native.file.pick/read/release`，网页版会话页在新手机壳上用原名与 100 MiB；随后做本机与 SSH 真机验证

### 2026-10-06 登记需求、调研与方案

- 本轮目标：按 fork 流程登记「移动端上传任意文件」，完成需求、调研与方案，进入实现
- 完成内容：用户确认存放位置、入口与大小上限三项取舍；完成现状调研（两种会话页形态、上传链路、目标机器判定、交付方式、版本兼容）；完成技术方案；在 `feat/mobile-file-attachment-upload` 分支登记功能
- 代码或文档变更：`docs/issue/移动端上传任意文件/**`、`config/fork-features.jsonc`、`config/architecture-policies.jsonc`、`.gitignore`
- 验证证据：`pnpm check:fork-features`、`pnpm check:fork-docs`、`pnpm check:architecture-policies -- --base Fartown/main` 通过，提交 `112fd202d3`
- 未解决问题：Q-1 保留期取值；Q-2 Claude Code 读取工作目录外文件是否弹权限确认；Q-3 Codex 对 `@路径` 的处理
- 下一步：实现电脑端 `fileAttachment.*` 与单测
