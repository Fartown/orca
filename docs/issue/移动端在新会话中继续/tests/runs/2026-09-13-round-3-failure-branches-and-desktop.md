---
title: "2026-09-13 第三轮：失败分支、桌面回归与首屏渲染"
document_type: test-run
status: completed
created: 2026-09-13
updated: 2026-09-13
---

# 2026-09-13 第三轮：失败分支、桌面回归与首屏渲染

## 1. 执行信息

- 执行时间：2026-09-13 21:10–21:35。
- 测试环境：
  - 移动端：同前两轮的云真机小米 15；TC-006 用 `mobile/scripts/mock-server.ts`（`PORT=6771`，临时 fixture 按 `/tmp/mock-fail-mode` 注入失败，验后已还原）；TC-009 用隔离 profile 的真实 Orca runtime（`PORT=6772`）加真 claude 会话。
  - 桌面端：本分支的 `pnpm dev` 构建（`orca-dev` profile，`ORCA_BACKGROUND_LAUNCH=1`，CDP 9433 驱动与截图，不抢焦点），与用户运行中的 Orca 互不影响。
- 代码版本或 Commit：`feat/mobile-session-continuation` @ `ba4bfaa18` + 本轮工作树改动（xterm 打包修复及其门禁登记）。
- 执行人：zhangchao.zc。
- 覆盖范围：TC-006、TC-007、TC-009；TC-008 未执行。

## 2. 执行结果

| Case ID | 实际结果 | 结论 | 证据 | 缺陷或遗留问题 |
| --- | --- | --- | --- | --- |
| TC-006 | 四个失败分支逐一注入并复现：`create-failed` 只走到 createTerminal，提示「Could not start a new Claude session.」；`create-no-handle` 只走到 createTerminal、`not-ready` 走到 wait、`send-rejected` 走到 send，三者均提示「The new Claude session started, but its context could not be sent.」。失败分支均未继续调用其后的 RPC。同一源 tab 连续四次触发，`clientMutationId` 恒为 `mobile-continuation:surface-claude:mtzujh5d` | PASS | `evidence/device/40~44-tc006-*.png`、`/tmp/mock6771.log` 入参 | - |
| TC-007 | 三层验证全过：①差分回归 2304 组输入（4 agent × 4 标题 × 2 cwd × 2 transcript × 3 prompt × 3 回复 × 2 capturedText × 2 模式），上游实现与本分支实现输出零差异；②运行中的桌面 dev 构建里入口仍在（`aria-label="在新会话中继续…"`，终端面板头部浮层），对话框标题/描述/智能体/上下文/启动目录/按钮齐全，两种模式切换文案正确；③真点「启动新会话」拉起新 claude，其 transcript 首条 user message 与本分支实现、上游实现三方逐字一致（1395/1395/1395），且保留了移动端不传的 `Orca pane:` 字段 | PASS | `evidence/desktop/01~04*.png`、`evidence/prompts/desktop-received-full.txt`、`scripts/desktop-continuation-parity.ts`、`scripts/desktop-runtime-prompt-check.ts` | - |
| TC-009 | App 冷启动后跑一次续接：新 tab 自动选中并持续渲染新 agent 输出直至给出回复，全程未切 tab；`[terminal-webview] engine error` 0 次，`DROPPED` 0 次 | PASS | `evidence/device/45-tc009-render-*.png`、`adb logcat -s ReactNativeJS` | - |
| TC-008 | 未执行 | - | - | 需要一台旧版本 Orca 主机；本机只有 1.4.197 |

## 3. 证据索引

| 证据 | 类型 | 对应 Case | 说明 |
| --- | --- | --- | --- |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/evidence/device/40~45*.png` | 截图 | TC-006、TC-009 | 四个失败分支的用户提示；首屏实时渲染 |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/evidence/desktop/01~04*.png` | 截图 | TC-007 | 桌面入口、对话框、两种模式、新会话 |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/scripts/desktop-continuation-parity.ts` | 脚本 | TC-007 | 上游 vs 本分支 2304 组输入差分回归 |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/scripts/desktop-runtime-prompt-check.ts` | 脚本 | TC-007 | 桌面运行时实际投递的 prompt 与两份实现三方比对 |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/evidence/prompts/desktop-received-full.txt` | 日志 | TC-007 | 桌面新会话 transcript 的首条 user message |

## 4. 缺陷与遗留问题

| 问题 | 严重程度 | 对应 Case | 处理状态 |
| --- | --- | --- | --- |
| 旧主机 `cwd` 丢弃分支未触发 | 中 | TC-008 | open（已接受风险） |

前两轮记录的「新 tab 首屏停在启动行」已定位为移动端终端 WebView 的 xterm 打包缺陷并修复，本轮 TC-009 复验通过，关闭。

## 5. 本轮结论

- 总体结论：TC-001~TC-007、TC-009 共 8 条全部通过。桌面端回归用差分 + 运行时三方比对双重确认，比单纯截图更强。移动端失败分支四种情况行为正确且不产生幽灵会话，幂等键按 REQ-005 复用。
- 未执行项：TC-008。
- 已接受风险：TC-008 无法在本机构造真实旧版本主机；依据是本功能不新增 RPC、`cwd` 为可选字段，且真机端到端已跑在不含本分支任何改动的 Orca 1.4.197 发布版主机上。
- 下一轮建议：拿到旧版本包后补 TC-008。
