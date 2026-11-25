---
title: '终端退出模式恢复'
slug: '终端退出模式恢复'
status: testing
created: 2026-11-24
updated: 2026-11-24
external_ids: ['Fartown/orca#156']
---

# 终端退出模式恢复 开发 Journal

## 1. 关键文档链接

| 类型 | 文档                                                    | 状态         | 说明                                         |
| ---- | ------------------------------------------------------- | ------------ | -------------------------------------------- |
| 需求 | [目标与范围](requirements/requirement.md)               | ready        | 原终端鼠标事件泄漏                           |
| 交互 | -                                                       | not-required | 不改变界面或操作入口                         |
| 调研 | -                                                       | not-required | 本轮在现有前台读取链路内修复，证据在开发记录 |
| 方案 | -                                                       | not-required | 复用宿主观察、身份校验和现有复位回调         |
| 用例 | [宿主观察与模式恢复](tests/cases/宿主观察与模式恢复.md) | ready        | 本地、paired、SSH 和身份边界                 |
| 验证 | [本地与 SSH](tests/runs/2026-11-24-本地与SSH.md)        | completed    | 定向测试、类型与实际终端证据                 |

## 2. 决策点记录

### D-001 2026-11-24：保留执行主机的明确前台观察

- 背景：原终端 shell 已独占前台，鼠标与键盘模式仍启用；reader 未消费 foregroundObservation，null 进程名被归入无证据。
- 备选项：将 null 当作 shell；增加轮询；消费当前 PTY/incarnation 的明确宿主观察。
- 最终决定：复用已有 freshness/authority admission 检查，保留观察中的 shell/non-shell 结论，调用现有模式复位回调。
- 原因：null、旧主机和失联不能证明 shell；明确 non-shell 不能退化成 shell 名称猜测。不新增读取、重试或重连。
- 影响范围：REQ-001、REQ-002；客户端读取/校验在客户端，前台进程观察在执行主机；本地、paired 和 SSH 均沿用现有主机路由。

## 3. 开发记录

### 2026-11-24：登记修复

- 本轮目标：修复反复鼠标事件泄漏，保留原会话及活跃 TUI。
- 完成内容：已定位当前 reader 丢失宿主明确 shell 观察的路径，建立 GitHub issue #156 与独立 worktree。
- 代码或文档变更：功能登记、范围约束、需求文档。
- 验证证据：主工作区 `.docs/terminal-mouse-report-ui-validation/2026-11-24/` 记录原 PTY、shell 前台和残留模式，临时恢复后原身份保持一致。
- 未解决问题：防复发实现和隔离本地/SSH 验证尚待完成；原退出当时的完整 OSC 时序不可恢复。
- 下一步：先写失败回归，再消费明确宿主观察，运行门禁与真实终端验证。

### 2026-11-24：实现与本地、SSH 实际终端验收

- 本轮目标：打通宿主明确 shell 观察至既有模式复位的链路，验证原终端身份及活跃 TUI 保留。
- 完成内容：复用 PTY/incarnation、时效与 authority/epoch 校验；remote inspect 携带 foregroundOnly；runtime 将宿主叶子 PTY 的观察映射回调用方 handle；兼容层保留只有 foregroundObservation 的结果；明确 non-shell 和 unverifiable 不授权复位。
- 代码或文档变更：已注册的前台 reader/tracker、RPC/IPC/preload 接缝和功能自有校验模块。主进程路由测试放在主进程自有目录，避免将整个 runtime 导入 renderer 类型检查。
- 验证证据：65 项定向测试通过，完整 pnpm tc 通过；隐藏 Electron 在本地执行主机和 Mini 的 SSH 隧道 paired runtime 上各连续两轮通过，保留同一 handle、PTY、incarnation，活跃 TUI 接收真实鼠标报告，退出后恢复普通输入。详见本轮 Test Run 和 `.docs/terminal-shell-mode-ui-validation/2026-11-24/`。
- 未解决问题：尚待最终提交门禁、PR checks 与集成；用户已安装版本未升级。没有 Android/iOS 原生设备验收；旧 relay 的单独真机链路仅有路由/身份单测覆盖。dbox 线程耗尽另外完成了配置和进程修复，不将其与模式恢复混为同一个缺陷。
- 下一步：运行最终门禁并提交 PR；持续核对远端检查，保留部署与用户当前版本的区分。
