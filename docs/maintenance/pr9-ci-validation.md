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
