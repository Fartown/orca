---
title: Linux 桌面更新入口
status: ready
created: 2026-10-30
updated: 2026-10-30
---

# TC-416 Linux 桌面更新入口

关联 REQ-415。

- 缓存中的 CLI 经 orca open 启动原 AppImage，profile 仍为指定隔离目录，运行进程提供有效 APPIMAGE/APPDIR。
- 原 AppImage 被替换后，经旧 CLI 也启动新源文件；源文件缺失时明确失败。
- 普通解包运行身份缺失时 automatic:false，检查更新显示错误，不能落为 not-available；合法 AppImage 正常检查。macOS/Windows 不进入 Linux 分支。
- 本地隐藏 renderer 通过 Playwright CDP 完成真实原生 A 到 B 更新，校验安装文件、运行版本、原终端身份、再次检查更新与截图。
- SSH 主机拥有自己的原 AppImage/profile/cache/environment；客户端通过连接读取状态并完成真实更新，原 shell 与 incarnationId 保留。断开时不触发新增主机读取。
- 正式安装分别记录实际版本、启动身份、检查结果和保留会话；隔离通过不得替代正式安装验收。

隔离验收记录：[2026-10-30 Linux 桌面更新入口实机验收](../runs/2026-10-30-linux-desktop-update.md)。正式安装单独验收，不由隔离结果推定。
