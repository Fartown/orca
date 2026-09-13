---
title: "2026-09-13 真 host 第二轮"
document_type: test-run
status: completed
created: 2026-09-13
updated: 2026-09-13
---

# 2026-09-13 真 host 第二轮

## 1. 执行信息

- 执行时间：2026-09-13 18:40–18:56。
- 测试环境：同第一轮的云真机（小米 15，`10.76.222.14:35469`，本分支代码经本机 Metro 加载）；主机换成**真实 Orca runtime**——已发布的 `/Applications/Orca.app` 二进制以 `--user-data-dir=/tmp/orca-realhost-profile --serve --serve-port 6770 --serve-mobile-pairing` 起在隔离 profile 上，不影响用户正在运行的 Orca。
- 代码版本或 Commit：客户端 `feat/mobile-session-continuation` @ `ba4bfaa18`；主机 Orca 1.4.197（不含本分支任何改动）。
- 执行人：zhangchao.zc。
- 覆盖范围：TC-001、TC-003、TC-005（focused + full 两种模式）；TC-006 未覆盖；TC-002 由第一轮覆盖；TC-007、TC-008 仍未执行。
- 源会话：`orca worktree create --name continuation-source --agent claude --prompt "…"` 在临时 repo `/tmp/orca-continuation-e2e` 上真起了一个 claude 会话，产生真实 transcript 与 agent status。

## 2. 执行结果

| Case ID | 实际结果 | 结论 | 证据 | 缺陷或遗留问题 |
| --- | --- | --- | --- | --- |
| TC-001 | 真 host 上长按真 claude 终端，菜单含「Continue in New Session…」，位置同第一轮 | PASS | `evidence/device/24-realhost-longpress.png` | - |
| TC-003 | 面板标题为 agent 自设的会话标题 `✳ Auth-middleware.js comment`，副标题 `Original agent: Claude`，源 agent Claude 排在 Codex 之前 | PASS | `25-realhost-picker.png` | - |
| TC-005（focused） | 新终端被创建、agent 被拉起、prompt 送达；收到的正文与共享内核输出 1546/1546 逐字一致；新 agent 复述了上一轮停点、核对 git status 与文件内容、判断无遗留工作后停下等指令 | PASS | `evidence/prompts/realhost-received-focused.txt` | 见下方缺陷 |
| TC-005（full） | 同上，1434/1434 逐字一致；新 agent 额外读取了完整 transcript 并逐行比对文件 | PASS | `evidence/prompts/realhost-received-full.txt` | 见下方缺陷 |
| TC-006 | 未覆盖 | - | - | 需要可注入失败的主机 |
| TC-007 | 未执行 | - | - | 本轮主机是 1.4.197 发布版二进制，不含本分支桌面改动，跑它验不了 REQ-003 |
| TC-008 | 未执行 | - | - | 本轮源会话无 `startupCwd`，`cwd` 字段未被发出，旧主机丢弃分支未触发 |

## 3. 证据索引

| 证据 | 类型 | 对应 Case | 说明 |
| --- | --- | --- | --- |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/evidence/device/22~32*.png` | 截图 | TC-001/003/005 | 配对、真工作区、长按、面板、投递后、渲染停滞与恢复 |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/evidence/prompts/realhost-received-{focused,full}.txt` | 日志 | TC-005 | 从新会话的 transcript JSONL 里取出的首条 user message |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/scripts/build-expected-prompt-realhost.ts` | 脚本 | TC-005 | source 字段从 host agent status 与磁盘 transcript 独立取，复算后逐字 diff |
| `.docs/mobile-session-continuation-ui-validation/2026-09-13/README.md`「真 host 端到端」 | 说明 | 全部 | 隔离 profile 起真 host 的方法、配对方式、渲染停滞的完整记录 |

## 4. 缺陷与遗留问题

| 问题 | 严重程度 | 对应 Case | 处理状态 |
| --- | --- | --- | --- |
| 移动端终端 WebView 打包的 xterm 里 `InputHandler.requestMode` 被 esbuild 打坏（`target=chrome74` 降级 `||=` 时丢掉 `let` 声明），任何 DECRQM 查询触发 `ReferenceError` 打死渲染器，表现为新 tab 停在启动行。根因经 CDP 堆栈 + 最小复现坐实；修复为 `build-terminal-webview-engine.mjs` 两行（`minify` → `minifyWhitespace + minifyIdentifiers`，产物 +0.68%），已在真机验证。非本功能引入（所有从出生就 attach 的移动端终端都中招），且 `check:architecture-policies` 拒绝在本分支改该上游文件，需单独开分支 | 中 | TC-005 | open（独立分支处理，修复已验证） |
| 失败分支未在真机复现 | 低 | TC-006 | open |
| 桌面端 UI 回归未做 | 中 | TC-007 | open |
| 旧主机 `cwd` 丢弃分支未触发 | 中 | TC-008 | open |

## 5. 本轮结论

- 总体结论：整条链路在真实 Orca 主机上跑通。主机为不含本分支任何改动的 1.4.197 发布版二进制，说明本功能确实不需要主机侧配合。两种上下文模式投递出去的 prompt 与共享内核逐字一致，被拉起的新 agent 按 prompt 要求正确行事。
- 未执行项：TC-006、TC-007、TC-008。
- 已接受风险：投递后新 tab 的首屏渲染停滞。根因是移动端终端 WebView 的 xterm 打包缺陷（详见 .docs/mobile-session-continuation-ui-validation/2026-09-13/README.md），影响面覆盖所有从出生就 attach 的移动端终端，非本需求引入；两行修复已在真机验证但被架构门禁挡在本分支之外，须单独开分支。
- 下一轮建议：用本分支的桌面构建跑 TC-007；构造带 `startupCwd` 的源会话 + 旧版本主机跑 TC-008；把 xterm 打包修复单独开分支落地（补丁见 build/terminal-webview-engine-minify-fix.patch）。
