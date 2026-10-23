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

## PR 代码审查补充

审查覆盖全部改动、主进程与 CLI 接管调用链、目录隔离边界、真实 RPC 字段以及隔离升级脚本的断言。发现一项 P2：验收器只比较 PTY ID，遗漏主机发布的 incarnationId；同 ID 的终端被重建后仍可能通过。采集脚本现保留 incarnationId，验收器要求已有 PTY 在两份快照中提供相同且非空的生命周期身份；普通无 PTY 标签不要求该字段。

两条新增回归在原验收器下失败，修复后通过；另增加无 PTY 标签通过的回归。验收器与接管相关 4 文件共 26 通过、2 项平台跳过。审查补丁仅修改安装验收，不修改应用运行代码；此前本地/SSH 实机升级的构建与运行证据仍对应上述产品提交，没有重新打包或操作生产实例。

审查前提交 `560338baf72fd130ed9e3699dd01b9263569ba94` 的完整 PR CI、Headless Node 与 Fork Integration Build 已全部通过；审查补丁的检查按新提交单独记录。

本轮复跑：出包、更新与接管相关 21 文件 189 通过、3 项平台跳过；移动端 21 通过；注册 CI 合同 98 通过，共 308 通过。pnpm tc、架构、fork 功能、fork 文档、三项本地化、按 PR 基线检查的代码质量与修改文件格式检查通过。脚本与日志位于相同证据目录的 review-checks.py、review-tests-_、review-gates-_、review-typecheck-*；没有重跑与本次验收器修改无关的实机打包升级。

## 证据与运行边界

证据在 `.docs/linux-update-paths-ui-validation/2026-10-23/`：scripts 含隔离构建与本地/SSH 驱动；evidence 含 build-identity、local/ssh-alias-update-result、完成截图、旧验收记录拒绝结果与门禁日志。

曾尝试恢复生产服务路径配置，未通过后已撤回。用户提醒后，构建及本记录中的有效实机验证均在隔离实例执行；没有退出当前桌面实例，没有安装测试包。生产配置尝试没有计为验证通过。
