# PR #9 CI 维护验证

本记录属于用户授权在 PR #9 完成的 CI 维护，不扩展文档预览需求。

## 2026-09-12 — 定位 Linux 工作区切换 E2E 超时

- 本轮目标：排除唯一失败门禁，不将本机通过当作 Linux CI 已修复。
- 完成内容：同 SHA 的 Linux 原样重跑仍在同一恢复断言超时，其余 22 项通过；本机重建后原 spec 5 轮通过，节流 true/false 对照未重现，根因未确认。
- 代码或文档变更：仅为原 E2E 的失败路径补充帧数、renderer 可见性、活动 tab 与 viewport 文本行数诊断；保留原错误、30 秒超时及所有断言。该测试因真实诊断改动登记为精确 CI 基础设施路径，不再是纯格式撤回。
- 验证证据：CI run `34671216354` attempts 1/2；本机证据 `.docs/document-preview-size-ui-validation/2026-09-12/switch-paint-repro/final-report.md`。未修改生产代码或操作日常 App。
- 未解决问题：Linux 失败时的采样器状态仍待诊断日志确认，不能宣称节流假说成立。
- 下一步：用既有 E2E workflow 的 `test_files` 输入定向诊断，修复并完成 PR 全部原有门禁后合入。

## 2026-09-12 — 修复隐藏 renderer 的测量前提

- 本轮目标：让原有帧采样在后台测试窗口中实际执行，不改变终端恢复逻辑或验收断言。
- 完成内容：Linux 定向 run `34677225298` 在失败时记录 `frames=0`、全部测量时间为 null；活动 tab 的真实 pane 已连接，viewport 60 行均有文本，证实超时来自测量回调没有执行。
- 代码或文档变更：沿用已有性能测试的 renderer 设置方式；每轮 reload 完成后，仅为该测试窗口关闭 background throttling，再执行原采样；显式保持 `ORCA_BACKGROUND_LAUNCH=1`，不显示窗口。
- 验证证据：上述 run/job `103509238375` 的失败 JSON；30 秒期限、5 轮、原挂载数和内容断言均保留。
- 未解决问题：修复后的 Linux 红绿对照与完整 PR CI 尚待完成，不先宣称修复通过。
- 下一步：同 SHA Linux 定向复测与完整 PR 检查全部通过后合入。

## 2026-09-12 — 补齐后台性能测试的启动配置

- 本轮目标：验证 renderer 设置之外的 Chromium 后台帧调度条件。
- 完成内容：run `34677531382` 证明单独 `setBackgroundThrottling(false)` 仍是 0 帧，不能将上一轮称为修复完成；本机 5 轮通过不改变这一结论。
- 代码或文档变更：补齐已有 `spinner-workspace-perf.spec.ts` 的两个 Chromium 启动参数，并记录每轮 native visible/backgroundThrottling 实际值；所有原断言不变。
- 验证证据：失败 job `103510079569` 的 viewport 60 行和 0 帧诊断；复测仍需以 Linux 结果为准。
- 未解决问题：补齐启动配置后的红绿对照与完整 PR CI 待执行。
- 下一步：定向复测，若仍失败继续基于实际帧策略与诊断定位，不循环盲重跑。

## 2026-09-12 — 对照 Linux 合成器配置

- 本轮目标：验证 Linux 禁用 GPU/compositing 的测试启动路径是否影响 rAF 采样。
- 完成内容：run `34677833928` 仍失败；测量开始前 native `visible=false`、`backgroundThrottling=false`，失败时仍为 0 帧且活动 viewport 60 行均有文本。两个 Chromium 参数不足以修复，具体暂停机制未定。
- 代码或文档变更：将依赖帧采样的 spec 标记为 `@headful`，使用仓库现有 Linux CI SwiftShader 合成器路径；显式 `ORCA_BACKGROUND_LAUNCH=1` 优先，native 窗口继续隐藏。原 5 轮、断言和超时保留。
- 验证证据：失败 job `103510911319` 日志 969–970 行；已有窗口策略测试覆盖后台变量优先于 headful 标记。
- 未解决问题：合成器配置变体尚待 Linux 实测，不能称已修复。
- 下一步：定向红绿对照，确认有效后完成最终 SHA 的全部 PR CI。

## 2026-09-12 — 使用规范要求的隔离显示器

- 本轮目标：在 CI 隔离显示器验证真正依赖绘制帧的用例，而不是继续猜测隐藏窗口参数。
- 完成内容：run `34678267281` 的 SwiftShader 隐藏变体仍为 0 帧、viewport 60 行文本。复核 `tests/AGENTS.md`：需要真实 pixels 的 spec 应标记 `@headful`，使用 fixture 的非激活显示策略；此类验证只在 CI/隔离显示器运行。
- 代码或文档变更：保留 `@headful` 与只读失败/窗口状态诊断；撤回本轮实验的强制隐藏、两个 Chromium flags 和 `setBackgroundThrottling(false)`。不修改生产启动策略，不添加 native show/focus 调用，不修改任何原断言或超时。
- 验证证据：job `103512092699` 981–982 行明确上一变体无效；下一轮只在 GitHub Linux Xvfb/openbox 上运行，不在用户桌面运行 headful spec。
- 未解决问题：隔离显示器红绿对照与最终 SHA 全部 PR CI 待完成。
- 下一步：确认原 5 轮与挂载/恢复契约实际通过，再更新 PR 结果并合并。
