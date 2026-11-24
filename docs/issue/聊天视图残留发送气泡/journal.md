---
title: 聊天视图残留发送气泡
document_type: journal
status: testing
created: 2026-11-13
updated: 2026-11-13
issue: 聊天视图残留发送气泡
external_ids: ['Fartown/orca#106']
---

# 聊天视图残留发送气泡

## 1. 关键文档链接

| 类型     | 文档                                                         | 状态         | 说明                                       |
| -------- | ------------------------------------------------------------ | ------------ | ------------------------------------------ |
| 需求     | [聊天视图残留发送气泡](requirements/聊天视图残留发送气泡.md) | ready        | REQ-8001～8004                             |
| 交互     | -                                                            | not-required | 不新增界面，只让过期气泡消失               |
| 方案     | -                                                            | not-required | 共享判断函数加桌面、手机各一处接缝，见决策 |
| 测试用例 | [气泡撤下与保留](tests/cases/气泡撤下与保留.md)              | ready        | 单元、本地与 SSH 真机、手机单元            |

## 2. 决策点记录

- 2026-11-13：根因是待确认气泡只对已加载窗口对账，而聊天视图只在可见时读取；窗口滑过发送边界和对应行后永远对不上。上游 main 同样如此。修法放在对账之后：已完成读取、仍有更早历史、边界行不在窗口、窗口最早一条 transcript 晚于边界时撤下。
- 2026-11-13：不采用「回读更早分页核对」：每次重新显示都要多读一次长 transcript，SSH 下还要传整页消息。也不改为隐藏时继续订阅，因为隐藏时停读是上游的性能设计。
- 2026-11-13：失败与未确认的气泡保留，它们可能是消息唯一副本。已知取舍：若某 agent 让一条排队消息等到会话写满一窗才送达（如 Codex 长回合里排队），视图重新显示后会先撤下气泡，消息送达后以真实行出现。
- 2026-11-13：执行位置。判断在客户端界面进程里完成（桌面渲染进程或手机 App），只用已收到的消息。transcript 文件与 agent 进程属于执行主机（本机或 SSH 主机），读取沿用已有链路；不新增端口、环境变量、配置、服务或文件。

## 3. 开发记录

### 2026-11-13 排查与实现（implementing）

- 本轮目标：确认聊天视图「看不到消息」的原因，并按 fork 流程修复。
- 完成内容：用 Orca 自己的读取器与对账函数回放用户真实 transcript，确认聊天视图内容与 transcript 一致，底部是 11-11 21:39 的本地气泡；按真实渲染链路回放证明视图持续可见时 21:40:29 即会撤下，气泡卡住意味着 21:40:29 至次日 00:45:40 之间视图从未在可见状态读到对应行。新增共享判断函数，桌面待确认对账与手机气泡撤下各接一处。
- 代码或文档变更：`src/shared/native-chat-paged-out-echo/`、桌面 `use-native-chat-pending-delivery.ts` 接缝、手机三处接缝、功能登记、策略、需求与用例。
- 验证证据：共享函数 11 项、桌面 hook 3 项、手机 3 项新测试通过；撤掉接缝后新增的「应撤下」用例失败，「应保留」用例通过；相关既有测试共 92 项（桌面）、217 项（手机）通过。排查脚本与证据见 `.docs/chat-view-stale-transcript-investigation/2026-11-12/`。
- 未解决问题：真机本地与 SSH 验证、全部门禁待完成。
- 下一步：跑门禁，做隔离实例的本地与 SSH 真机验证，提 PR 关联 #106。

### 2026-11-13 本地与 SSH 真机验收（testing）

- 本轮目标：在隔离实例里复现用户现象，并验证修复在本地与 SSH 工作区都生效。
- 完成内容：脚本用真实界面从聊天框发送、切到终端模式、按 Claude 写法追加 362 行后切回。去掉修复的对照组在本地和 SSH 都复现了「待确认气泡钉在最新回复下方」，带修复的两轮切回后会话以最新回复结尾。
- 代码或文档变更：测试执行记录；REQ-8001～8004 标为已实现。
- 验证证据：见 [本机与SSH验收](tests/runs/2026-11-13-本机与SSH验收.md) 与 `.docs/chat-view-paged-out-echo-ui-validation/2026-11-13/`；真实 `~/.orca-remote` 与真实 HOME 顶层条目前后一致，测试密钥已撤销。
- 未解决问题：手机端没有真机验证；配对远程 Orca 未单独真机验证。
- 下一步：提交，按 pr.yml 跑静态分析与 `pnpm check:changed`，推送并开 PR 关联 #106。

### 2026-11-21 上游同步到 fa60d0a566（testing）

- 本轮目标：`fork/integration` 从 `e723de1bfd` 合入上游到 `fa60d0a566`（四次合并：`22afb84f6a`、`9c3b42f644`、`d725f407e8`、`31df22fb1a`，冲突都在第一次），保持已送达且被分页挤出的发送气泡在桌面与手机上都能退场。
- 完成内容：本功能 4 个冲突（全是 UU）。桌面 `use-native-chat-pending-delivery.ts` 已被上游搬到 `native-chat/session/terminal/delivery/`，以上游为底加回「分页挤出的气泡退场」（与终端聊天视图恢复的持久提交共用这个文件），保留上游新增的 `composerRef`、`workingEpoch`、重发/编辑提示与 `useNativeChatOptimisticSend`。手机端 `mobile-native-chat-pending-echo.ts`、`use-mobile-native-chat-drafts.ts` 随上游换目录后重放；`use-mobile-native-chat-controller.ts` 为不超过 300 行，原来的 `transcriptHasMore: nativeChatSession.hasMore` 改成一行 `...mobileNativeChatTranscriptWindow(nativeChatSession)`，实现放在自有 `mobile/src/native-chat-paged-out-echo/mobile-transcript-window.ts`，行为不变。
- 代码或文档变更：`config/fork-features.jsonc` 接缝 3 条换路径、1 条换 mustContain（`mobileNativeChatTranscriptWindow(nativeChatSession)`）；桌面 checks 里 2 个上游测试换新路径；`dependsOn` 1 条换路径。合并后没有本功能的单独修复提交。新棘轮基线未登记本功能条目。
- 验证证据：登记 checks 桌面 4 文件 22 项、手机 7 文件 14 项通过（`/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/sync-checks-run3.log`）；冲突解法见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/report-D-terminal-chat.md`、`phase2-D.tsv`；最终门禁见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/final-gates.log`。真机抽查（`/Users/bytedance/dev/orca/.docs/upstream-sync-ui-validation/2026-11-21/README.md`）未覆盖本功能，桌面、手机、本机与 SSH 都没有做。
- 未解决问题：同步后的构建没有真机复验气泡退场；手机控制器的调用形状改写只有单测守护。
- 下一步：下次真机回归按「气泡撤下与保留」用例在本机与 SSH 各跑一轮，手机端一起看。
