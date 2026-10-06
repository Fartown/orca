---
title: "2026-10-06 真实 App 电脑端第二轮（审查修复后）"
document_type: test-run
status: completed
created: 2026-10-06
updated: 2026-10-06
---

# 2026-10-06 真实 App 电脑端第二轮（审查修复后）

## 1. 执行信息

- 执行时间：2026-10-06 18:54。
- 测试环境：同第一轮（隐藏隔离的本分支 e2e 构建；手机身份经移动端配对码 + WebSocket + E2EE；SSH 主机为本机 root sshd `127.0.0.1:2222`，远端 HOME 隔离）。
- 代码版本或 Commit：`feat/mobile-file-attachment-upload` 工作区（`b40e0947c5` 之后的审查修复：SSH 上传根目录改到远端家目录并 `chmod 700`、SSH 攒块写入、按客户端限并发、按连接缓存写入目标）。
- 执行人：zhangchao.zc（agent 执行）。
- 覆盖范围：TC-004、TC-005、TC-007、TC-008、TC-011、TC-012（电脑端）、TC-013、TC-016。

## 2. 执行结果

| Case ID | 实际结果 | 结论 | 证据 | 缺陷或遗留问题 |
| --- | --- | --- | --- | --- |
| TC-004 | 3 MiB `设计 说明 v2.pdf` 写到本机 `orca-file-attachments-501/`，根目录 700，sha256 一致，`git status` 为空 | PASS | L1 | - |
| TC-005 | 2 MiB `server-logs.tar.gz` 写到隔离远端 HOME 下的 `.orca-remote/file-attachments/`，根目录权限 700，sha256 一致，远端 `git status` 为空 | PASS | S1 | - |
| TC-007 | SSH 断开后上传立即被拒，错误 `The workspace host is not connected`，未重连 | PASS | S3 | - |
| TC-008 | 本机与 SSH 终端用手机交付的转义路径执行 `wc -c <`，字节数一致 | PASS | L5、S2 | - |
| TC-011 | 90 MiB 用时 4.0 s；主进程 RSS 增长 11.6 MiB | PASS | L2 | - |
| TC-012（电脑端） | 100 MiB + 1 字节在开始时被拒 | PASS | L3 | - |
| TC-013 | 写入一块后出现 1 个上传目录，取消后消失 | PASS | L3 | - |
| TC-016 | 手机身份调用 `files.writeBase64Chunk` 返回 `forbidden` | PASS | L4 | - |

## 3. 证据索引

| 证据 | 类型 | 对应 Case | 说明 |
| --- | --- | --- | --- |
| `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/evidence/run-1791282872076/checks.json` | 结果 | 全部 | 8 项检查的预期与观测值 |
| `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/evidence/run-1791282872076/cleanup.json` | 结果 | - | 隔离 profile、远端上传目录已删除，`authorized_keys` 无测试密钥 |
| `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/evidence/run-console-round2.log` | 日志 | 全部 | 控制台输出 |

## 4. 收尾

- 本机临时目录下本轮写入的 `orca-file-attachments-501`（约 99 MB）已删除；真实 `~/.orca-remote` 运行前后一致。
