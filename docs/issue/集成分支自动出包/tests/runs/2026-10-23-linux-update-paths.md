---
title: Linux 数据目录别名与安装验收修复
status: completed
created: 2026-10-23
updated: 2026-10-23
---

# Linux 数据目录别名与安装验收修复

关联 REQ-414 与 TC-415；修复 PR 为 #67，目标分支 fork/integration。产品代码提交 `b47dc9fad328ea8c0f561c87b65fe3095e2fddf5`，本记录仅补充文档。PR 尚待用户审查及完整 CI，没有合入或安装测试包到正式实例。

## 代码与验收判断

- 原代码下，真实文件系统目录别名回归分别在 Linux/macOS 分支失败；修正后，两种平台分支均能在 handoff 文件尚未创建时接管。其他目录、错误文件名和缺失配置仍拒绝。
- 主进程接缝委托功能自有的路径解析器，复用既有 isSameUserDataPath；没有新增更新 RPC、下载器或安装器。
- 新验收器要求服务与 CLI 版本一致、网页可访问、初始化完成且支持 supervised-headless-serve 自动更新，并核对标签、PTY、已有 provider session 与 daemon 保留。
- 以原 .55 安装验收记录重新运行，新验收器返回退出码 1，明确拒绝 automatic:false；不再读取不存在的 unsupportedReason 字段。

## 隔离实机升级

构建与验证使用独立 HOME、配置、缓存、显示器和端口；清除宿主 ORCA 环境变量。由正常 build:release 与 integration electron-builder 配置生成 preview.9011、preview.9012 两包；测试发布服务只重定向 Fartown 发布请求，实际下载、SHA512 校验、原路径替换、CLI 接管和新版本 ready 均走产品代码。

| 验证项          | 本地 Linux                                  | SSH Ubuntu 20.04 / glibc 2.31               |
| --------------- | ------------------------------------------- | ------------------------------------------- |
| profile 路径    | 符号链接，指向同一隔离真实目录              | 符号链接，目标目录属于 SSH 主机             |
| 真实升级        | 1.4.214-preview.9011 → 1.4.214-preview.9012 | 1.4.214-preview.9011 → 1.4.214-preview.9012 |
| 升级前后支持    | supervised-headless-serve / automatic:true  | supervised-headless-serve / automatic:true  |
| shell PID       | 1388189 → 1388189                           | 1879 → 1879                                 |
| 原终端 identity | 保留，同一 handle 与 incarnation            | 保留，同一 handle 与 incarnation            |
| 更新后执行      | 原 shell 接受并执行验证命令                 | 原 shell 接受并执行验证命令                 |
| 网页显示        | Updated，目标版本 9012                      | Updated，目标版本 9012                      |

SSH 使用 root sshd 与独立测试用户。包、profile、下载缓存、替换与新服务都属于容器内的执行主机；客户端只有浏览器及 SSH 转发。测试发布服务经专用反向转发访问，不把客户端的 127.0.0.1 当作远端的同一地址。

## 自动化与门禁

- 出包及更新相关：21 文件，186 通过、3 项平台跳过。
- 原生 updater 及 AppImage 回归：5 文件，92 通过、3 项平台跳过。
- 注册 CI 合同：98 通过；移动端集成更新：21 通过。
- pnpm tc、架构、fork 功能、fork 文档、三项本地化、改动代码质量与格式检查通过；完整 PR CI 单独报告。

## 证据与运行边界

证据在 `.docs/linux-update-paths-ui-validation/2026-10-23/`：scripts 含隔离构建与本地/SSH 驱动；evidence 含 build-identity、local/ssh-alias-update-result、完成截图、旧验收记录拒绝结果与门禁日志。

曾尝试恢复生产服务路径配置，未通过后已撤回。用户提醒后，构建及本记录中的有效实机验证均在隔离实例执行；没有退出当前桌面实例，没有安装测试包。生产配置尝试没有计为验证通过。
