---
title: "2026-09-13 云真机第一轮"
document_type: test-run
status: completed
created: 2026-09-13
updated: 2026-09-13
---

# 2026-09-13 云真机第一轮

## 1. 执行信息

- 执行时间：2026-09-13 18:20–18:30。
- 测试环境：BITS 云真机 小米 15（`24129PN74C`，Android 15），`adb connect 10.76.222.14:35469`；App `com.stably.orca.mobile` arm64-v8a debug 包，JS 由本机 Metro（`http://10.95.173.189:8081`）加载本分支代码；主机为 `mobile/scripts/mock-server.ts`（`PORT=6769`，让开用户在跑的 Orca 占用的 6768）。
- 代码版本或 Commit：`feat/mobile-session-continuation` @ `ba4bfaa18`，外加一处仅用于本轮的临时 fixture（会话结束后已 `git checkout` 还原）。
- 执行人：zhangchao.zc。
- 覆盖范围：TC-001 ~ TC-005；TC-006 部分；TC-007、TC-008 未执行。

## 2. 执行结果

| Case ID | 实际结果 | 结论 | 证据 | 缺陷或遗留问题 |
| --- | --- | --- | --- | --- |
| TC-001 | 长按 `claude · add auth middleware` 后菜单第 2 项为「Continue in New Session…」，位于 Switch to chat view 与 Switch to Desktop 之间 | PASS | `evidence/device/14-longpress-menu.png` | - |
| TC-002 | 长按 `zsh` 后菜单仅 Switch to Desktop / Rename / Clear Terminal / Close / Close Other Tabs | PASS | `evidence/device/21-zsh-longpress-no-entry.png` | - |
| TC-003 | 面板标题为源 tab 标题，副标题 `Original agent: Claude`，含模式切换行与 Continue with Codex / Continue with Claude | PASS | `evidence/device/15-continuation-picker.png` | - |
| TC-004 | 切到完整记录后文案改为「Switch to focused handoff / Now: full session transcript …」，重开面板回到 focused | PASS | `evidence/device/16-full-transcript-mode.png`、`19-picker-second-open.png` | - |
| TC-005 | 两种模式各投递一次：RPC 依次为 createTerminal → wait → send，无其他方法；full 模式 prompt 1140 字节、focused 模式 1252 字节，均与共享内核输出逐字一致；投递后客户端订阅 `term-continuation` | PASS | `evidence/prompts/`、`evidence/device/17-after-continue-claude.png`、`20-after-continue-codex.png` | mock 的 `session.tabs.list` 不返回新建 tab，故 tab 条短暂只剩一个，属 fixture 局限 |
| TC-006 | 仅验证幂等键：`clientMutationId = mobile-continuation:surface-claude:mtzo6qwy`，以源 tab id 为键；四个失败态未在真机复现 | BLOCKED | 同上日志 | 需要可注入失败的主机，留待下一轮 |
| TC-007 | 未执行 | - | - | 需要桌面端 Orca 回归 |
| TC-008 | 未执行 | - | - | 需要一台旧版本主机 |

## 3. 证据索引

| 证据 | 类型 | 对应 Case | 说明 |
| --- | --- | --- | --- |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/evidence/device/13~21*.png` | 截图 | TC-001 ~ TC-005 | 会话页、长按菜单、面板、两种模式、投递后状态、反例 |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/evidence/prompts/device-received-full.txt` | 日志 | TC-005 | 真机在完整记录模式下实际投递出去的 prompt 全文 |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/evidence/prompts/device-received-focused.txt` | 日志 | TC-005 | 真机在 focused 模式下实际投递出去的 prompt 全文 |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/scripts/build-expected-prompt.ts` | 脚本 | TC-005 | 用共享内核复算期望 prompt 并逐字 diff |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/README.md`「真机验证」 | 说明 | 全部 | 环境、临时改动与抓到的 RPC 入参 |

## 4. 缺陷与遗留问题

| 问题 | 严重程度 | 对应 Case | 处理状态 |
| --- | --- | --- | --- |
| 失败分支未在真机复现 | 低 | TC-006 | open |
| 桌面端 UI 回归未做 | 中 | TC-007 | open |
| 旧版本主机兼容未实测 | 中 | TC-008 | open |

## 5. 本轮结论

- 总体结论：移动端客户端侧全部通过。入口只在符合条件的 agent 终端出现，面板与两种上下文模式行为符合预期，投递出去的 prompt 与桌面端共享内核逐字一致，编排只用到已在移动端白名单内的三个 RPC。
- 未执行项：TC-007（桌面端回归）、TC-008（旧主机兼容）；TC-006 仅覆盖幂等键。
- 已接受风险：本轮主机为 mock，主机侧「建终端 → tui-idle 真就绪 → 多行粘贴作为一条消息提交」的真实行为由 2026-09-13 早些时候针对真实 Orca 主机的 `orca` CLI 探针覆盖（claude 2312 ms / codex 2146 ms 就绪，send accepted 且观测到 `turn_started`），两轮合起来覆盖客户端与主机两侧。
- 下一轮建议：在真实 Orca 主机上串一次端到端（需用户同意把手机与其运行中的 Orca 配对，并在一个临时工作区起真 claude 会话）；补 TC-006 失败分支与 TC-007 桌面回归。
