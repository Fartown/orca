---
title: "移动端在新会话中继续"
slug: "移动端在新会话中继续"
status: designing
created: 2026-09-13
updated: 2026-09-13
external_ids: []
---

# 移动端在新会话中继续 开发 Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [requirements/移动端在新会话中继续.md](requirements/移动端在新会话中继续.md) | ready | REQ-001~006：claude/codex 续接、只复用已开放能力、桌面行为不变、旧主机兼容、失败可感知、范围限定 |
| 交互 | - | not-required | 以桌面端既有『在新会话中继续』对话框为交互基线，移动端按现有 ActionSheet 范式落地；无独立设计稿 |
| 调研 | [research/移动端「基于当前会话新建对话」的现状与技术链路调研.md](research/移动端「基于当前会话新建对话」的现状与技术链路调研.md) | ready | 桌面端 continuation 全链路、移动端可复用能力、主机侧投递器与 RPC 白名单；含 2026-09-13 真机验证结论 |
| 方案 | [solutions/移动端续接会话终端通道方案.md](solutions/移动端续接会话终端通道方案.md) | reviewing | 共享 prompt 内核 + 终端长按入口 + 建终端→等就绪→投递编排；不新增 RPC；含 fork 注册条目与工作包 |
| 测试用例 | - | pending-decision | 需求尚未确认，不编写 Test Case |

## 2. 决策点记录







### D-006 Agent History 页不加入口，功能只在终端 tab 长按菜单

- 日期：2026-09-13
- 背景：D-005 把用户对第 4 问的回答理解为『历史页入口应默认存在』并扩成双入口设计；用户随后两次澄清：不理解为何要在历史卡片上改动，并明确『这里不需要加入口，只在长按里加就行了』
- 最终决定：单一入口；D-005 中关于 Agent History 入口纳入第一期的部分作废，其余（两种模式、自动切换）保留；REQ-007 删除
- 原因：用户明确意图；历史页不改任何既有交互
- 影响范围：需求 In/Out of Scope 与 REQ-007；方案回到单一入口、8 个 seam

#### 备选项

- 双入口（终端长按 + 历史卡片图标）
- 单一入口：终端 tab 长按菜单（用户确认）

#### 关联文档与需求点

- 无

### D-005 方案评审结论：Agent History 入口纳入第一期，两种模式都提供，创建后自动切换

- 日期：2026-09-13
- 背景：首版方案把 Agent History 入口列为二期（D-004），把「完整会话记录」模式与「创建后是否切换」列为待确认。用户评审：入口放长按菜单；两种模式都提供、和 PC 一样；自动切换可以；不同意把 Agent History 入口推后——桌面端 AI Vault 行本来就带这个动作，它是同一功能的第二个入口而非附加特性。代码事实：移动端 Agent History 页已有 Resume 在做「直连建终端 → 发送 → 跳到目标工作区」，目标工作区解析、幂等键、卡片禁用态均可复用；唯一差异是历史页拿不到会话页的 handleCreateTerminal
- 最终决定：纳入第一期；D-004 中「Agent History 入口列为二期」失效，其余不变。两种上下文模式第一期都提供；新会话创建后自动切换为当前 tab
- 原因：用户明确要求与 PC 一致；技术上无阻塞，只是编排核心需要把『怎么建终端』抽成注入参数
- 影响范围：新增 REQ-007；REQ-001 补两种模式与自动切换；方案新增 7.7 节与 3 个 agent-history seam；Out of Scope 移除该项

#### 备选项

- 维持二期（缩范围）
- 纳入第一期，编排核心改为创建器可注入，两个入口各接一个薄创建器（用户确认）

#### 关联文档与需求点

- 无

### D-004 第一期范围：claude / codex 终端通道；其余延后

- 日期：2026-09-13
- 背景：用户确认先按 claude 和 codex 做；stdin-after-start 类 agent 的 tui-idle 判定依赖前台进程加静默兜底，本机 kimi 未验证；Agent History 入口与结构化通道各需独立设计
- 最终决定：第一期只做 claude / codex 终端通道；stdin-after-start 类 agent、Agent History 入口、结构化通道列为二期
- 原因：用户明确限定；未验证的就绪判定不进第一期
- 影响范围：REQ-006、Out of Scope

#### 备选项

- 第一期同时覆盖全部 TUI agent
- 第一期只做 claude / codex 终端通道（用户确认）

#### 关联文档与需求点

- 无

### D-003 入口放终端 tab 长按菜单，按源 agent、transcript 路径与主机能力三重门控

- 日期：2026-09-13
- 背景：桌面端入口在终端面板右键菜单与 AI Vault；移动端终端长按菜单现有 5 项动作，由 getMobileTerminalActionSheetActions 集中构造；主机能力门控已有 quickCommandsSupported 范式；移动端没有终端回滚缓冲的回退来源
- 最终决定：方案建议采用第二条，待用户评审确认；显示条件为 agent ∈ {claude, codex} 且 providerSession.transcriptPath 存在 且主机能力含 terminal.prompt-delivery.v1
- 原因：对位桌面端终端右键入口；复用既有动作构造与门控范式；terminal.prompt-delivery.v1 与 waitSubmitMs/提交观测同代引入，可作为主机具备 terminal.wait 与提交观测的代理，避免向旧主机发送会被剥离的字段
- 影响范围：REQ-004、REQ-006；方案模块「入口与门控」

#### 备选项

- 会话头部「⋯」更多菜单
- 终端 tab 长按菜单（方案建议）
- Agent History 卡片

#### 关联文档与需求点

- 无

### D-002 prompt 构建逻辑迁入 src/shared，桌面端原文件改为转发导出

- 日期：2026-09-13
- 背景：buildAgentSessionContinuationPrompt 与 buildBoundedSessionTranscript 是只依赖 shared 类型的纯函数，但物理位置在渲染进程 lib；移动端生产代码从不 import 渲染进程模块，既有共享方式为放 src/shared 或注释标注移植
- 最终决定：方案建议采用第二条，待用户评审确认
- 原因：单一实现才能满足 REQ-001『prompt 与桌面端逐字一致』与 REQ-003『桌面行为不变』；re-export 把上游 seam 收敛为 2 个文件，8 个调用方 import 不变，合并上游时冲突面最小
- 影响范围：REQ-001、REQ-003；fork 注册 seams

#### 备选项

- 移动端移植一份副本并注释 keep in sync
- 迁入 src/shared/agent-session-continuation/，桌面端两个原文件保留为 re-export（方案建议）
- 迁入 shared 并直接改桌面端 8 个调用方的 import

#### 关联文档与需求点

- 无

### D-001 首条 prompt 投递走终端通道：建终端后等就绪再发送

- 日期：2026-09-13
- 背景：移动端要把交接 prompt 送进新会话，主机侧有三条候选：session.tabs.createTerminal 携带 agentPrompt 由主机注入 argv（上限 6000 字符，原子）；建终端后 terminal.wait(tui-idle) 再 terminal.send（无 argv 长度约束，三个方法均在移动端白名单，2026-09-13 真机对 claude/codex 各验证通过）；结构化 agentSession.create 后 agentSession.send（创建不接受首条 prompt，且受 createSupport 限制）
- 最终决定：方案建议采用第二条，待用户评审确认
- 原因：与桌面端 submit-after-ready 语义一致（桌面端同样裸启动后粘贴提交，注释写明多行生成 prompt 不进 shell argv）；交接 prompt 中 lastAssistantMessage 单项上限 8000 字符，agentPrompt 的 6000 上限不够；结构化通道留二期
- 影响范围：REQ-001、REQ-002、REQ-005；方案模块「续接编排」

#### 备选项

- createTerminal + agentPrompt（主机 argv 注入）
- createTerminal → terminal.wait(tui-idle) → terminal.send（方案建议）
- agentSession.create → agentSession.send（结构化）

#### 关联文档与需求点

- 无

## 3. 开发记录

### 2026-09-13 代码评审修正

- 本轮目标：按 `/code-review` 的发现与自查结果修正实现，并让每条结论都有核实依据
- 完成内容：补断线保护；去掉对移动端恒为空的提交观测并收窄 delivered 语义；去掉建立在该错误前提上的主机能力门控（连带撤回两个 seam，seam 10→8）；编排改持 client 对象；新增 created-without-handle 终态；忙碌/无连接给出反馈；模式行改为开关语义并删死代码；按源 tab 复用创建幂等键以真正满足 REQ-005
- 代码或文档变更：mobile/src/session-continuation/ 全部 8 个文件与 4 个测试；mobile/src/session/ 的 5 个 seam（其中 2 个撤回）；config/fork-features.jsonc、config/architecture-policies.jsonc；方案变更记录
- 验证证据：核实依据——`terminal-send-method.ts` 的 `useSettledAgentPrompt` 要求 desktop 客户端、`ensureUnsupportedTerminalPromptReceipt` 额外要求编排上下文；`terminal.wait` 自 2026-07-04 起在移动端白名单内；`DirectRpcClient.sendRequest` 是读 `this` 的类方法。测试——移动端 163 文件 1532 项通过（含 parity 基线重取，EFFECT 与 CAPABILITY 回到原始值，反证门控接线已彻底撤回）；桌面端与白名单共 8 文件 38 项通过；pnpm tc、oxlint、check:fork-features、check:fork-docs 通过
- 未解决问题：check:architecture-policies 仍有 2 条既有违规（`orcad-entry.ts`、`electron-builder-config.test.mjs`），在干净的 fork/integration 上同样复现，与本功能无关
- 下一步：云真机（小米）真机验收，并把可复用的真机流程写入 .docs/

### 2026-09-13 实现 WP0–WP4：共享 prompt 内核、门控、入口与投递编排

- 本轮目标：按已批准方案完成移动端「在新会话中继续」的代码实现与门禁验证
- 完成内容：prompt 构建与有界转录迁入 src/shared（桌面端两文件转为转发导出，调用方零改动）；新增 mobile/src/session-continuation（允许集与主机能力门控、源采集、菜单项、面板行、投递编排、文案、controller 适配层）；10 处上游 seam 接线（长按菜单注入、面板挂载、建终端返回 handle 与 cwd、能力探测与状态、tab 类型补 startupCwd、controller 接入、路由 parity 基线并把新门控纳入其 capability 名单）；注册 fork feature、架构策略、上游 diff 预算与 .gitignore 放行
- 代码或文档变更：src/shared/agent-session-continuation/（新增，含 2 个迁入文件与 1 个测试）；mobile/src/session-continuation/（新增 8 个文件，含 4 个测试）；10 个上游 seam 文件（src/renderer/src/lib/ 2 个；mobile/src/session/ 8 个）；config/fork-features.jsonc、config/architecture-policies.jsonc、.gitignore、docs/issue/README.md
- 验证证据：pnpm tc 全量通过；oxlint 无告警；feature checks 桌面 33 项 + 移动 37 项通过；移动端全量 1526 项通过；check:fork-features / check:fork-docs / check:max-lines-ratchet / check:ts-nocheck-ratchet / verify:rpc-params-catalog / 四项 localization 全部通过；REQ-002 三条硬约束逐条核验：mobile-rpc-allowlist.test.ts 未改即过（其正则跨行匹配到新增的 terminal.wait 与 terminal.send）、src/shared/rpc-contract 与 protocol-version.ts 零改动、移动端新代码对 src/renderer 零 import
- 未解决问题：无
- 下一步：真机 UI 验收（WP5）：需构建移动端 App 并按方案 §10 自测场景逐项执行；随后补 tests/cases 与 tests/runs

### 2026-09-13 按用户澄清回滚 Agent History 入口

- 本轮目标：让方案与用户意图一致：只在终端长按菜单加入口
- 完成内容：删除 REQ-007 并把历史页入口写入 Out of Scope；方案撤回 §7.7、可注入创建器、3 个 agent-history seam，恢复单一入口设计；Journal 新增 D-006
- 代码或文档变更：docs/issue/移动端在新会话中继续/requirements/移动端在新会话中继续.md；docs/issue/移动端在新会话中继续/solutions/移动端续接会话终端通道方案.md
- 验证证据：validate_task 阶段校验；方案 Mermaid 图经解析器验证
- 未解决问题：无
- 下一步：用户批准后进入 WP0

### 2026-09-13 撤回历史卡片图标形态的用户询问，按既有范式定为第二内联图标

- 本轮目标：消除方案最后一个开放问题
- 完成内容：历史卡片新动作按卡片既有内联图标范式放在 ▶ 旁；Resume 与展开行为不改；需求未决问题清零
- 代码或文档变更：docs/issue/移动端在新会话中继续/requirements/移动端在新会话中继续.md；docs/issue/移动端在新会话中继续/solutions/移动端续接会话终端通道方案.md
- 验证证据：validate_task 阶段校验
- 未解决问题：无
- 下一步：用户批准方案后进入 WP0：注册 fork feature、切 feat/mobile-session-continuation 工作树

### 2026-09-13 方案评审：吸收四项结论并更新方案

- 本轮目标：根据用户评审更新需求与方案，使第一期与桌面端入口对等
- 完成内容：需求新增 REQ-007、REQ-001 补两种模式与自动切换、四项未决问题关闭；Journal 新增 D-005；方案改为双入口 + 可注入创建器，新增 7.7 Agent History 入口，注册条目与工作包同步
- 代码或文档变更：docs/issue/移动端在新会话中继续/requirements/移动端在新会话中继续.md；docs/issue/移动端在新会话中继续/solutions/移动端续接会话终端通道方案.md
- 验证证据：validate_task 阶段校验；方案 Mermaid 图经解析器验证
- 未解决问题：无
- 下一步：用户确认历史卡片第二内联图标形态；确认后进入 WP0 注册与实现

### 2026-09-13 完成调研、真机验证与首版技术方案

- 本轮目标：回答移动端能否与桌面端一样基于当前会话新建对话，并给出第一期（claude / codex）方案
- 完成内容：代码调研文档（含桌面端全链路、移动端可复用能力、主机侧三套投递器、RPC 白名单、95 个索引文件）；真机验证 claude / codex 各一次建终端→等就绪→投 14 行 prompt 全部跑通；需求 REQ-001~006；决策 D-001~D-004；技术方案进入评审
- 代码或文档变更：docs/issue/移动端在新会话中继续/research/移动端「基于当前会话新建对话」的现状与技术链路调研.md；docs/issue/移动端在新会话中继续/requirements/移动端在新会话中继续.md；docs/issue/移动端在新会话中继续/solutions/移动端续接会话终端通道方案.md；.docs/mobile-session-continuation-ui-validation/2026-09-13/（README、探针脚本、两组证据；git 忽略）
- 验证证据：调研文档结构校验通过；方案与调研文档共 9 张 Mermaid 图经 mermaid 解析器验证；真机：claude wait 2312ms / codex 2146ms 均 satisfied，send 均 accepted 且 stages 含 turn_started，agent 各回复 PROBE-OK ZEBRA
- 未解决问题：无
- 下一步：用户评审方案（入口位置、完整记录模式是否第一期提供、是否自动切到新 tab）；评审通过后 WP0 注册 feature 并在 feat/mobile-session-continuation 工作树实现
