---
title: "2026-10-06 云真机第一轮（Android，原生会话页）"
document_type: test-run
status: completed
created: 2026-10-06
updated: 2026-10-06
---

# 2026-10-06 云真机第一轮（Android，原生会话页）

## 1. 执行信息

- 执行时间：2026-10-06 18:05–18:50。
- 测试环境：BITS 云真机荣耀 PTP-AN00（Android 16，arm64）；本分支 dev 构建（`expo prebuild` + `assembleDebug` arm64）经本机 Metro 加载；电脑端为本分支 e2e 构建，以隔离 userData、`--serve --serve-mobile-pairing` 起在 6771 端口，未触碰用户的 Orca（6768）。工作区为本机 git 仓库，主机终端里运行真实 Claude Code。
- 代码版本或 Commit：`feat/mobile-file-attachment-upload` @ `b40e0947c5`。
- 执行人：zhangchao.zc（agent 执行）。
- 会话页形态：**原生会话页**。电脑端因缺陷 1 拒收整份网页包，所有页面退回原生，网页版会话页与 `native.file.*` 本轮未覆盖。
- 覆盖范围：TC-001、TC-002、TC-003、TC-009、TC-010、TC-012（手机部分）；TC-013 手机侧未执行（断网会同时断开走网络的 adb）。

## 2. 执行结果

| Case ID | 实际结果 | 结论 | 证据 | 缺陷或遗留问题 |
| --- | --- | --- | --- | --- |
| TC-001 | 终端输入栏与聊天输入框点按回形针都弹出「Attach」菜单，含 Photo、File | PASS | `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/evidence/device/TC001-terminal-attach-menu.png`、`TC001-chat-attach-menu.png` | - |
| TC-002 | 终端选 Photo 后 Claude 输入框出现 `[Image #1]`；聊天选 Photo 出现图片待发项 | PASS | `TC002-terminal-photo-after.png`、`TC002-chat-photo-after.png` | - |
| TC-003 | 系统选择器中 pdf、zip、txt、png、bin 均可选 | PASS | `TC003-terminal-file-picker.png` | - |
| 终端上传（TC-008 手机端） | 选 `logs.zip` 后主机临时目录文件 sha256 与手机一致；路径写入终端未回车；补 `unzip -l` 回车列出 4 项。长按回形针直接打开文件选择器 | PASS | `UP-zip-after.png`、`TERM-unzip-after-enter.png`、`LONGPRESS-terminal-clip.png` | - |
| TC-009 | Claude 用 Read 读取 `report.pdf`，回复含文中 secret word `PELICAN-42` | PASS | `TC009-reply.png`、`TC009-host-claude-screen.txt` | 会话处于 bypass permissions，Q-2 未被检验 |
| TC-010 | `notes.txt` 以 `@路径` 插入草稿，`shot.png` 成为待发图片；agent 复述出 notes 中的独特句子并说出图片颜色 | FAIL | `TC010-notes-attached.png`、`TC010-png-attached.png`、`TC010-reply.png` | 缺陷 2：含 `@路径` 的消息停在 Claude 输入框不提交，需手动回车 |
| TC-012（手机） | 选 101 MiB 的 `huge.bin` 提示「File is over 100 MB」，主机无新目录 | PASS | `TC012-huge-toast.png` | - |
| TC-013（手机） | 未执行 | BLOCKED | - | 云真机经网络 adb，断网即失联 |

## 3. 缺陷

1. **网页包被电脑端整份拒收。** 会话路由的必需授权 13 个加可选授权 4 个（`externalNavigation` 与三个 `native.file.*`）共 17 个，超过协议上限 `MOBILE_WEB_BUNDLE_MAX_ROUTE_GRANTS = 16`；电脑端日志 `grants and optionalGrants together must not exceed the route grant ceiling`，所有网页页面退回原生。构建期 `verify-mobile-web-app-bundle` 未拦住。处理：新接口收为一个 `native.file.pick`，读取与释放走 `native.media.read/release`（读取偏移上限放宽到 100 MiB），会话路由降为 15 个授权；新增 `config/scripts/mobile-web-page-routes-contract.test.mjs` 按协议校验每条路由（D-008）。
2. **聊天里含 `@路径` 的消息在 Claude 终端里不提交。** `@` 打开 Claude 的文件提及菜单，菜单吞掉发送时的回车；手动输入 `@/tmp/...` 同样复现。处理：聊天输入框改为插入纯路径（含空格时加引号）（D-007）。

## 4. 证据索引

| 证据 | 类型 | 对应 Case | 说明 |
| --- | --- | --- | --- |
| `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/evidence/device/` | 截图与文本 | 全部 | 截图、`device-checks.jsonl`、主机终端快照 |
| `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/build/host-serve-first-run.log`、`host-serve-second-run.log` | 日志 | 缺陷 1 | 电脑端拒收网页包的原始日志 |
| `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/build/android-build.log`、`metro.log` | 日志 | - | dev 构建与 Metro |

## 5. 收尾

- 云真机已释放、adb 已断开；续租脚本、Metro、隔离主机已停；`/tmp` 下的隔离目录与主机写入的上传目录已删除。
- 主机里的 Claude 会话记录被写进了真实 `~/.claude/projects/`（e2e 实例的已知问题），已按目录名精确删除，摘要存于 `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/evidence/device/claude-transcript-summary.txt`。
