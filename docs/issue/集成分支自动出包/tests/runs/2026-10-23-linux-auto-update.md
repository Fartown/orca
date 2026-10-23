---
title: Linux 服务自动更新验收
status: completed
created: 2026-10-23
updated: 2026-10-23
---

# REQ-414 / TC-415 验收

本地及 SSH 真实 AppImage 升级通过。开发验证包 preview.9001/9002 通过原 integration electron-builder 配置构建，只用于隔离试验；正式发布和用户安装另行记录，当前用户服务仍为 preview.54。

| 验证         | 结果                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| 单元和回归   | 28 个文件，317 通过、10 项平台跳过；移动端 21 通过                                                              |
| 静态门禁     | 完整 `pnpm tc`、架构、fork 登记与文档、三个本地化门禁通过；当前分支全部增量质量扫描和 CI 范围完整 fork 扫描通过 |
| 本地原生升级 | 标准 `AppImage serve --supervise`；网页普通检查找到 B，下载、原路径替换、新进程 ready 和重连完成，handoff 清除  |
| 校验失败     | 测试发布服务故意改变安装包 1 字节，原生 SHA512 校验拒绝；旧版本及原 runtime 保持运行，界面显示失败并允许重试    |
| 本地终端     | 同一 handle 持续输出；升级后接受命令并输出 `after-update-accepted`                                              |
| SSH 原生升级 | root sshd 的隔离容器，独立用户启动服务；浏览器 HTTP 与 WebSocket 均通过 SSH 转发，服务器文件从 A 原位替换为 B   |
| SSH 终端     | 原 shell PID 3827 和同一 handle 保留；升级后接受命令并输出 `ssh-after-update-accepted`                          |
| 安装包完整性 | 本地与 SSH 安装路径 SHA256 均等于 B：`3f02b5287f3577b6ebd1b486868b272f4cab7ba513201baced664d14eb12d737`         |
| 平台边界     | 无来源、未受监督、无 IPC 时拒绝自动更新；macOS 原有测试保留，平台专属跳过不计作真机验证                         |

证据位于 `.docs/linux-auto-update-ui-validation/2026-10-23/`，包括验证脚本、坏包/升级完成截图、脱敏运行日志、摘要及 runtime 记录。测试通过 Node Inspector 将 Fartown 发布请求转向隔离 HTTP 夹具；安装器、下载校验、原路径替换、监督器和重连均为真实实现。开始安装前断开 Inspector，避免调试连接阻止 Node 正常退出。

发现并修复：直接运行 AppImage 时，替换后才读取源文件会把新 inode 当作旧运行版本；现在在等待退出前捕获源标识，挂载模式和缓存模式都有测试。坏包校验沿用原生更新器。用户生产配置、会话和历史 transcript 未参与试验。
