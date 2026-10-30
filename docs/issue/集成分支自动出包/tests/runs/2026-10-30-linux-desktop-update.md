---
title: Linux 桌面更新入口实机验收
status: completed
created: 2026-10-30
updated: 2026-10-30
---

# REQ-415 / TC-416 隔离验收

正式 .55 实例由桌面图标经 `orca open` 启动缓存中的解包程序，缺少 APPIMAGE/APPDIR。使用本机已安装的 electron-updater 与该环境复现 active:false；运行时却返回 automatic:true / not-available。公开 .66 的更新清单和安装包地址均正常。

本轮复用现有缓存来源记录与 AppImage 环境清理，让公共 CLI 从原 AppImage 启动；保留显式 profile、启动覆盖和非 Linux 路径。已识别为 AppImage 的集成安装缺少有效来源身份时，在请求发布源前报告错误，配对客户端沿用 automatic:false / manual-service-update-required，不新增 wire 字段。

## 本地与 SSH 真实升级

由标准 build:release 与 integration electron-builder 配置生成两个真实 AppImage，基于 .66 提交 d0a91443f8f1 加本轮修复。9101/9102 仅用于隔离测试，不是公开发布；精确源码快照见 evidence/source-identity.json。构建使用仓库要求的 Node 24.21.0 / pnpm 12.14.0；Electron 43.7.8 使用已核对版本的本机分发文件，未绕过打包校验。

| 检查         | 本地桌面                                              | SSH 主机服务                                          |
| ------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| 真实升级     | preview.9101 → preview.9102                           | preview.9101 → preview.9102                           |
| 入口         | 实际注册的公共 CLI：orca open → 原 AppImage           | 经 root sshd 启动 AppImage serve --supervise          |
| profile      | 独立 HOME/profile/cache/Xvfb                          | SSH 主机独立 HOME 与符号链接 profile                  |
| automatic    | 前后均 true，interactive                              | 前后均 true，supervised-headless-serve                |
| 原 shell PID | 1774575 → 1774575                                     | 1819233 → 1819233                                     |
| 原终端       | 同一 ptyId 与非空 incarnationId，继续执行命令         | 同一 handle、ptyId 与非空 incarnationId，继续执行命令 |
| 更新后入口   | 公共 CLI 再次打开目标版本；普通更新检查正确返回无更新 | 网页显示 Updated 与目标版本                           |
| 安装字节     | 原路径文件 SHA256 等于目标包                          | 原生下载、SHA512 校验、原路径替换与接管               |

本地先核对无诊断参数的原生重启进程版本、真实 AppImage 环境、profile 与原 shell，再重新打开独立实例取得 Playwright CDP 截图；截图不代替原生重启验收。保留终端会继承旧 CDP 监听句柄，验证脚本每次诊断启动选择新端口，避免误连旧监听器。

SSH 使用本轮建立的 root sshd（127.0.0.1:2222）。AppImage、来源记录、下载缓存、profile、环境和服务均属于 SSH 执行主机；客户端仅通过 SSH 转发访问。发布夹具经专用反向转发接入，未把客户端 127.0.0.1 当作远端端口。夹具只重定向发布请求；下载器、校验器、替换、接管和更新界面均为实际产品实现。

## 禁用身份的真实界面回归

另起实际打包的解包程序，不提供 APPIMAGE/APPDIR。运行时公布 automatic:false；普通桌面检查停在 error，界面显示 Update Check Failed。通过既有 Show details 展开后可读到从原 AppImage 重新打开的操作建议；不再显示没有新版本。截图与状态分别为 evidence/desktop-disabled-updater-error.png 和 evidence/disabled-updater-result.json。

## 自动化和门禁

- 更新、启动、集成出包及注册 CI 合同：30 文件，345 通过、8 项平台跳过。跳过不计作对应平台的实机验证。
- 移动端相关：21 通过；保留终端验收器提取复用后：17 项回归通过。
- pnpm tc、架构、fork 功能与文档、三个本地化门禁和按 PR 基线的改动代码质量检查通过。
- 正常出包完成 glibc 基线、打包主进程依赖、daemon、内置 Node/PTY、插件资源与服务资源校验。

## 正式实例边界

当前用户实例 PID 1303104、版本 .55。已从缓存来源记录与安装 SHA256 校验原 AppImage，恢复当前进程的 APPIMAGE/APPDIR；底层更新器从 active:false 变为 active:true。同一进程通过真实 GitHub 发布源检查到 .66，8 个现有 PTY 标签基线已保存。

这次恢复没有退出当前应用，没有替换正式安装，没有修改用户账户或客户端凭据。它是当前进程的恢复；持久修复仍需本轮代码发布并完成正式升级，不能将隔离验收或发现更新当作正式安装成功。

全部脚本、构建日志、版本/环境/PTY 证据与截图位于 `.docs/linux-desktop-update-ui-validation/2026-10-30/{scripts,evidence,build}`。正式安装与发布结果在后续开发记录中单独补充。
