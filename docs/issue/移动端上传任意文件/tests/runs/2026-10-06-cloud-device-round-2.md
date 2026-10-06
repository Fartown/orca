---
title: "2026-10-06 云真机第二轮（Android，网页版会话页）"
document_type: test-run
status: completed
created: 2026-10-06
updated: 2026-10-06
---

# 2026-10-06 云真机第二轮（Android，网页版会话页）

## 1. 执行信息

- 执行时间：2026-10-06 19:00–19:40。
- 测试环境：BITS 云真机荣耀 PTP-AN00（Android 16）；第一轮的 dev APK，JS 经本机 Metro（`EXPO_PUBLIC_MOBILE_SHELL=ota`，开发构建走网页壳所需）；电脑端为本分支 e2e 构建与网页包，以隔离 userData 起在 6771 端口。
- 代码版本或 Commit：`feat/mobile-file-attachment-upload` @ `1a08acf71a`。
- 执行人：zhangchao.zc（agent 执行）。
- 会话页形态：**网页版会话页**。依据：电脑端日志无清单协议错误；`orca status` 含 `mobileWeb.bundle.v1`；进入会话时出现「Downloading workspace 1/123 files」，加载后页面角标为包 `81b9febd90c7`；Metro 日志无原生会话页的终端诊断输出。
- 覆盖范围：TC-001、TC-002、TC-003、TC-010、TC-012（手机）、TC-018，Q-2 观察；Q-3 未执行。

## 2. 执行结果

| Case ID | 实际结果 | 结论 | 证据 | 缺陷或遗留问题 |
| --- | --- | --- | --- | --- |
| TC-001 | 网页版终端与聊天输入框点按回形针都弹出「Attach」菜单 | PASS | `.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/evidence/device-round2/11-terminal-attach-menu.png`、`41-chat-attach-menu.png` | - |
| TC-002 | 终端 Photo 写入图片路径；聊天 Photo 出现图片待发项 | PASS | `21-terminal-photo-after.png` | - |
| TC-003 | pdf、txt、png、bin 均可选 | PASS | `12-file-picker.png` | 本轮设备上没有 zip，zip 由第一轮覆盖 |
| TC-018 | `report.pdf` 在主机上名为 `report.pdf`，sha256 `c607d4ca…` 一致；62914560 字节的 `mid-60m.bin` sha256 `0859e377…` 一致，约 164 s（约 0.38 MB/s，受云真机网络限制） | PASS | `15-after-pdf.png`、`17-after-60m.png` | - |
| TC-012（手机） | 106 MB 的 `huge.bin` 提示「File is over 100 MB」，主机无新目录 | PASS | `19-huge-toast-a.png` | - |
| TC-010 | 聊天里 `notes.txt` 以不带 `@` 的绝对路径插入，`shot.png` 成为待发图片；点发送后直接提交，回复含 `MAGENTA-WALRUS-7` 与图片颜色 | PASS | `42-chat-notes.png`、`43-chat-png.png`、`47-chat-ready.png` | 路径以 `/` 开头时出现 Claude 的斜杠命令建议（未阻断提交）；已改为聊天路径一律加引号 |
| Q-2 | 手动启动、`auto mode on` 的 Claude 读取上传的 PDF 时弹出「Read outside the working directories」，四个选项含「Yes, and keep allowing any reads outside the working directories」；选「Yes, but ask again next time」后回复含 `PELICAN-42` | 观察 | `33-q2-permission-prompt.png`、`q2-permission-dialog.txt`、`q2-reply.txt` | 非 bypass 模式下首次读取需要用户确认，见需求 Q-2 |
| Q-3 | 未执行 | BLOCKED | - | 隔离的 `CODEX_HOME` 下 codex 仍显示已登录（凭据来自共享钥匙串），使用它可能刷新用户真实凭据 |

## 3. 其他观测

- 上传进行中离开会话页，上传在后台继续并完成；取消路径未触发。
- 主机终端经 `/usr/bin/login` 启动，会重置 HOME 与 PATH，验证用的 `claude` 包装脚本一度被绕过；改为设 `ZDOTDIR` 后才全程走隔离 HOME（见第 4 节）。

## 4. 事故与收尾

- 包装被绕过期间，手动启动的 Claude 使用了真实 HOME：向真实 `~/.claude.json` 写入一条测试仓库信任记录（已删除），拉起 `claude daemon`（已结束，其新建的 `session-env/…`、`daemon/auth` 已删除）。未提交任何提示词，真实 `~/.claude/projects/` 前后无变化。未清理：真实 `~/.claude/` 下被改写的 `daemon.log`、`daemon/roster.json`、`daemon.status.json` 与 `backups/` 中 18:45–18:59 的备份（其中可能有用户自己的会话所产生的）。
- 云真机已释放、adb 已断开、续租已停；Metro 与隔离主机已停；`/tmp/orca-r2` 与系统临时目录下的 `orca-file-attachments-501` 已删除。
- 前后对比：`.docs/mobile-file-attachment-upload-ui-validation/2026-10-06/build/r2-claude-projects-{before,after}.txt`、`r2-codex-{before,after}.txt`。
