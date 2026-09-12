---
title: Fork 原生更新验收
document_type: test-run
status: completed
created: 2026-09-13
updated: 2026-09-13
---

# Fork 原生更新验收

- 关联用例：TC-403、TC-404、TC-405；需求：REQ-403、REQ-404、REQ-405。
- 被测代码：`65d8777a0b96441d2c5c4d2d79b2d7223540b29d`。
- 实际环境：GitHub hosted macOS 15 / Apple Silicon；Electron 43.6.0。
- 本轮不做 Intel 专项验收，不触碰用户日常 App。

## 实际结果

| 检查点 | 结果与证据 |
| --- | --- |
| 固定自签原生更新正反例 | [P0 arm64](https://github.com/Fartown/orca/actions/runs/34705144558/job/103583748850) 同证书 A→B 替换/重启通过，错证书和篡改包拒绝；失败后 A 可启动 |
| 真实 LaunchServices 隔离前置 | 恢复临时 HOME 后 Node/Electron home 一致；调用原 `configureDevUserDataPath`，错误 HOME 仍被拒绝 |
| 真实 Orca 正常 ZIP 成品 | 一次 build:release、两次正常 ZIP 包装；A/B 签名、版本、架构及包内 app-update.yml 核验通过 |
| 默认 fork 手动检查与下载 | 真实 net.fetch 路由前置通过，界面发现 B、下载完成；原生 staging 及 quitAndInstall 执行 |
| 原生替换与启动 | A PID 47908 退出，磁盘版本为 B；native B PID 48661 发布正确 Unix runtime 并稳定 15459ms；替换后 strict 验签通过 |
| 原终端连续性 | 仪器化重开后的 B PID 49194 版本正确；同一 PTY ID；升级后命令不包含随机值，而是读取原 shell 环境变量并输出匹配的 AFTER 值，排除旧滚屏/回显假阳性 |
| 隐藏运行与清理 | 检查到 0 个可见窗口；cleanup errors=[]，临时签名私钥在运行前删除，scratch 已删除 |
| 本地回归 | 371 项桌面/发布测试、9 项移动控制器通过；双端类型、质量、架构、fork 功能/文档、本地化、max-lines 门禁通过 |
| Android 原生系统安装 | 已在 Android 16 arm64 隔离模拟器安装旧 release APK 并验证入口，预留文字大小 125% 设置；完整云发布后的默认源下载与系统覆盖安装仍待执行，不是实体手机验收 |

完整 P2：[第十二轮 SUCCESS](https://github.com/Fartown/orca/actions/runs/34713324181)。4 张状态截图及原始 JSON 位于该 run artifact，本地索引为 `.docs/integration-updates-ui-validation/2026-09-12/real-orca-ci/34713324181/`。

## 修复归因

- 实际产品签名故障：ad-hoc 跨版本身份不同；采用固定证书 PEM 签名，保留原生验证，正反例实测通过。
- 实际完整包故障：rcodesign 不能签不可执行 MH_OBJECT `.o`；仅将这类对象保留为受哈希保护的资源，篡改仍拒绝。
- 验收脚本故障：目录目标缺更新配置、误匹配保留 daemon、错误 plutil 诊断、失效窗口诊断、自动检查与 fixture 路由竞态均分别修正，不冒充产品更新器缺陷。
- 最终原生弹框实录：`Refusing to start E2E outside its disposable home boundary`。LaunchServices 恢复真实 HOME 而保留测试 profile，触发未修改的隔离守卫。只修 P2 签前测试入口；不删守卫、不改生产启动逻辑或系统全局环境。

## 验收边界与遗留

- HTTP 仅将精确 fork 端点映射到本轮隔离 fixture；不等于从正式 GitHub 发布下载。更新器、签名、ZIP、系统替换和 PTY 没有替身。
- P2 在正常签名前加入只读异常观察器及绑定本轮临时 HOME 的启动初始化，并给 A/native B 同样加入 mock-keychain；不进入正式发布，未验证真实钥匙串授权。
- 仅手动默认源检查；通过既有 lastUpdateCheckAt 避免启动自动检查早于测试 route，不声称本轮原生验收覆盖自动调度。
- native B 先独立证明 PID/runtime 稳定，再额外重开仪器化 B 验证界面/终端；不将后者截图描述为同一个 native B 进程截图。
- 本轮通过时尚未补成功路径的 monitor 文件复制，不能声称 artifact 含 native B 恢复前/后的 HOME 原始行；LaunchServices 正反例、native runtime 和终端证据均实际存在。
- macOS 固定自签不等于 Developer ID 或公证；旧 ad-hoc 包需手动安装一次新固定身份包。
- PR 最新 CI、完整集成发布和 Android 默认云源系统覆盖安装仍须继续；本报告 completed 指这次已完成的测试运行，不代表整个需求 done。
