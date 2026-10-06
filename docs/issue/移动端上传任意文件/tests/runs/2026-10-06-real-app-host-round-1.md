---
title: "2026-10-06 真实 App 电脑端第一轮（本机 + SSH）"
document_type: test-run
status: completed
created: 2026-10-06
updated: 2026-10-06
---

# 2026-10-06 真实 App 电脑端第一轮（本机 + SSH）

## 1. 执行信息

- 执行时间：2026-10-06 17:41–17:42。
- 测试环境：本分支 e2e 构建（`electron-vite build --mode e2e` + `build:relay`）以隐藏、隔离 profile 启动（`ORCA_BACKGROUND_LAUNCH=1`，窗口全程不可见、不聚焦）；脚本以手机身份用移动端配对码（`local-only`）经 WebSocket + E2EE 连入，走真实的移动端白名单。SSH 主机为本机 root sshd `127.0.0.1:2222`，测试密钥带强制命令把远端 HOME 隔离到临时目录，relay 部署在隔离 HOME 下。
- 代码版本或 Commit：`feat/mobile-file-attachment-upload` @ `243b95172f`。
- 执行人：zhangchao.zc（agent 执行）。
- 覆盖范围：TC-004、TC-005、TC-007、TC-008、TC-011、TC-012（电脑端部分）、TC-013、TC-016。手机界面相关的 TC-001、TC-002、TC-003、TC-009、TC-010、TC-012（手机部分）未在本轮执行；TC-006、TC-014、TC-015、TC-017 由自动化测试覆盖（见第 3 节）。

## 2. 执行结果

| Case ID | 实际结果 | 结论 | 证据 | 缺陷或遗留问题 |
| --- | --- | --- | --- | --- |
| TC-004 | 3 MiB `设计 说明 v2.pdf` 写到 `{应用临时目录}/orca-file-attachments-501/{时间戳}-{uuid}/设计 说明 v2.pdf`，根目录 700，sha256 一致，`git status` 为空 | PASS | L1 | 首跑因断言把 realpath 与非 realpath 路径直接比较而误报，修正断言后通过 |
| TC-005 | 2 MiB `server-logs.tar.gz` 写到 SSH 主机（隔离 HOME 的 relay）临时目录 `orca-file-attachments/`（无 uid 后缀，证明走的是 SSH 写入），sha256 一致，远端 `git status` 为空 | PASS | S1 | SSH 主机与电脑是同一台机器，路径无法证明「不在电脑本机」；以写入器差异（根目录名）与隔离 HOME 下的 relay 为证 |
| TC-007 | 断开 SSH 后上传立即被拒，错误 `The workspace host is not connected`；3 秒后连接状态仍非 connected | PASS | S3 | - |
| TC-008 | 本机与 SSH 终端各执行一次：把手机交付的转义路径（含空格、单引号、括号）接在 `wc -c <` 后，输出 12345 / 4321 与上传字节数一致 | PASS | L5、S2 | - |
| TC-011 | 90 MiB 用时 3.7 s（约 24 MiB/s，本机 WebSocket）；主进程 RSS 增长 52 MiB | PASS | L2 | RSS 含 base64 帧的瞬时占用，未随文件大小线性增长 |
| TC-012（电脑端） | 声明 100 MiB + 1 字节时开始即被拒，错误 `File is too large to attach` | PASS | L3 | 手机部分未执行 |
| TC-013 | 写入第一块后出现 1 个上传目录，取消后该目录消失 | PASS | L3 | - |
| TC-016 | 手机身份调用 `files.writeBase64Chunk` 返回 `forbidden` | PASS | L4 | - |

## 3. 证据索引

| 证据 | 类型 | 对应 Case | 说明 |
| --- | --- | --- | --- |
| `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/evidence/run-1791279687469/checks.json` | 结果 | 全部 | 每项检查的预期与观测值 |
| `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/evidence/run-1791279687469/progress.jsonl` | 日志 | 全部 | 逐步日志 |
| `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/evidence/run-1791279687469/cleanup.json` | 结果 | - | 隔离 profile 已删除、远端上传目录已删除、`authorized_keys` 已无测试密钥 |
| `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/evidence/orca-remote-before.txt`、`orca-remote-after.txt` | 快照 | - | 真实 `~/.orca-remote` 运行前后一致 |
| `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/scripts/file-attachment-validation.ts`、`run.sh` | 脚本 | 全部 | 可重复运行的验证入口 |
| 自动化测试 | 单测 | TC-006、TC-014、TC-015、TC-017 | `src/main/runtime/rpc/methods/file-attachment-upload.test.ts`（同名、清扫）、`mobile/src/file-attachment-upload/file-attachment-upload-client.test.ts`（旧电脑端两支）、`file-attachment-picker.web.test.ts`（旧手机壳）、`src/main/file-attachment-upload/file-attachment-upload-mobile-ws.test.ts`（真实 WebSocket + E2EE） |

## 4. 收尾

- 本机系统临时目录下由本轮写入的 `orca-file-attachments-501`（约 200 MB，含 90 MiB 测试文件）已删除。
- 未触碰用户正在运行的 Orca、`/Applications`、真实 `~/.orca-remote`。
