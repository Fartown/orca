---
title: Linux 桌面更新入口方案
status: ready
created: 2026-10-30
updated: 2026-10-30
---

# Linux 桌面更新入口方案

关联 REQ-415。现有桌面启动脚本经稳定 CLI 进入缓存中的 Electron，丢失 APPIMAGE；底层 updater 返回 null 后被收敛为 not-available，而 support 仍报告 automatic:true。

复用 resolveAppImageBuildWatch 与 namespace 来源记录，orca open 在 Linux 上选择原 AppImage 文件。复用已有环境清理逻辑，让 AppImage 自己设置 APPIMAGE/APPDIR；清除旧缓存与 Node 模式变量，并保留显式 profile。macOS/Windows 和显式启动覆盖沿用既有行为。已知源文件缺失时报告失败，不启动无更新身份的旧缓存。

集成更新 feed 在网络请求前检查 AppImage 运行身份，身份无效时返回明确错误；远程状态沿用 automatic:false 与 manual-service-update-required，不增加协议字段。主机断开时仍由现有连接层处理。

本地与 SSH 的原安装、来源记录、缓存、profile、环境变量和服务全部由执行主机拥有；用于验证的发布夹具只重定向发布请求，下载校验、文件替换与重启仍由原生更新器完成。客户端只通过已连接主机读取状态，不将自己的 127.0.0.1 或路径当作远端资源。

先用隔离 HOME/profile/cache/display 完成桌面入口真实 A 到 B 更新及再次检查；另验 SSH 服务更新与保留原终端。正式安装前准备回滚材料，当前用户实例的退出与切换单独记录。验证证据位于 .docs/linux-desktop-update-ui-validation/2026-10-30/。
