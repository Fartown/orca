---
title: '终端退出模式恢复'
slug: '终端退出模式恢复'
status: implementing
created: 2026-11-24
updated: 2026-11-24
external_ids: ['Fartown/orca#156']
---

# 终端退出模式恢复 开发 Journal

## 1. 关键文档链接

| 类型 | 文档                                      | 状态         | 说明                                         |
| ---- | ----------------------------------------- | ------------ | -------------------------------------------- |
| 需求 | [目标与范围](requirements/requirement.md) | ready        | 原终端鼠标事件泄漏                           |
| 交互 | -                                         | not-required | 不改变界面或操作入口                         |
| 调研 | -                                         | not-required | 本轮在现有前台读取链路内修复，证据在开发记录 |
| 方案 | -                                         | not-required | 复用宿主观察、身份校验和现有复位回调         |

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
