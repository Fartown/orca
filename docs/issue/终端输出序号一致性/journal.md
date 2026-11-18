---
title: 终端输出序号一致性
status: done
created: 2026-11-18
updated: 2026-11-18
external_ids:
  - Fartown/orca#146
---

# 终端输出序号一致性

## 1. 关键文档链接

| 类型     | 文档                                             | 状态         | 说明                         |
| -------- | ------------------------------------------------ | ------------ | ---------------------------- |
| 需求     | [目标与范围](requirements/requirement.md)        | ready        | REQ-001～004                 |
| 技术方案 | [输出位置归一](solutions/overview.md)            | ready        | 原子挂接边界与旧 daemon 兼容 |
| 测试用例 | [恢复与去重](tests/cases/恢复与去重.md)          | ready        | 本地、SSH、版本兼容          |
| 测试记录 | [本地与 SSH](tests/runs/2026-11-18-本地与SSH.md) | completed    | 真 PTY、真实客户端与宿主 A/B |
| 交互设计 | -                                                | not-required | 不增加交互                   |

## 2. 决策点记录

### D-001：由执行端适配器证明输出流位置

- 日期：2026-11-18。
- 背景：真实抓包快照比后续回显高约 21.8 万；隔离真实 PTY/daemon 断开重挂后，快照 62、runtime 16、随后新回显 35。
- 备选项：取消去重；直接 max 快照；所有帧新增绝对序号；在已有挂接边界重建流位置。
- 最终决定：复用 daemon 同步取快照后挂接的边界，适配器记录实际接收量，发布独立的 streamPosition；runtime 用流位置校准，快照继续保留其覆盖位置。
- 原因：控制/流双 socket 有到达竞态，快照位置不等于已交付流位置；现存旧 daemon 的普通帧不带 seq，无法依赖升级 daemon 才生效。
- 影响范围：执行主机适配器、内部 providerSequence 与 runtime；客户端去重和远程 wire 不变。关联 REQ-001～004。

## 3. 开发记录

### 2026-11-18：重连测试固定事件时间

- 本轮目标：消除 CI flaky-test ratchet 报出的三处真实时钟依赖。
- 完成内容：真实 socket 重连测试使用固定事件时间，继续等待实际输出与连接状态；旧客户端复用 ID 的取消准备测试改用已有原始 socket pair 夹具，继续验证服务端取消语义，不再覆写每次连接都会重建的 clientId。
- 代码或文档变更：`daemon-stream-reconnect.test.ts`、既有 preflight replacement 夹具及其接缝登记、本记录；产品逻辑和门禁不变。
- 验证证据：新 head 真实 SSH 丢帧恢复验收通过，执行端 stdin 与客户端回显一致，原 PTY/incarnation 保持不变；定向测试与 ast-grep 门禁结果见主证据目录。
- 未解决问题：PR 必需检查仍须按最终 head 完整通过。
- 下一步：推送修正，完成 PR checks 与合入。

### 2026-11-18：CI 模块边界收敛

- 本轮目标：解决 CI 对三个 daemon 模块的 300 行上限。
- 完成内容：rawLength/dataGap 解释与 spawn-result 投影收进 feature-owned 模块；既有 snapshot ownership probe 归回 snapshot 模块，保持相同公开行为。
- 代码或文档变更：新增 `delivered-stream-spawn-result.ts`，收窄 adapter/result 接缝，登记 snapshot 模块接缝。
- 验证证据：重组后 109 项定向测试、完整 5 project 类型检查与 CI 同命令文件 lint 通过，结果保存在主证据目录。
- 未解决问题：第一轮 CI 的类型与本地化通过，但完整 lint 因文件行数失败；以修正后的新 head 检查为准。
- 下一步：推送新 head，完成 PR checks 与合入。

### 2026-11-18：完成根本修复与真实 SSH A/B

- 本轮目标：补齐原版真实客户端失败与修复版通过的完整对照。
- 完成内容：适配器记录实际 streamPosition；保留快照覆盖位置；runtime 以交付水位校准；每个认证连接对使用新 lease ID，隔离旧回调。普通旧 daemon 帧不需要新增 seq。
- 代码或文档变更：feature-owned 模块及 daemon/client/provider/runtime 接缝，既有夹具断言、登记、方案与测试记录。
- 验证证据：真实 SSH 原版 stdin/owner screen 有回显而镜像没有；修复版两端一致；49 项连接回归、1452 项 runtime 回归、完整 5 project 类型检查通过。见测试记录和 ignored 主证据目录。
- 未解决问题：原用户 renderer baseline 未读出；不扩大历史归因。原生移动端和旧 relay 未做单独真机验证。用户实例安装状态仍须单列；本地定义完成，PR CI/合入由 PR checks 继续核实。
- 下一步：完成最终门禁与 PR CI，合回 fork/integration；清理已结束的 fixture 和 worktree。

### 2026-11-18：诊断与实现启动

- 本轮目标：恢复断流后真实短输入回显，并保留真实去重。
- 完成内容：真实 Mini wire 抓包、owner 只读核实、真实隔离 PTY/daemon 复现；建立 issue 和独立 worktree。
- 代码或文档变更：登记本需求、方案与验收用例。
- 验证证据：主工作区 `.docs/terminal-input-mirror-ui-validation/2026-11-18/`，原版真实 PTY 62/35 序号复现通过。
- 未解决问题：原故障 renderer 内部 baseline 未取得；不宣称每次历史故障均同因。修复和完整门禁仍待执行。
- 下一步：实现适配器边界计数、runtime 校准，覆盖本地和 SSH 隔离 App。
