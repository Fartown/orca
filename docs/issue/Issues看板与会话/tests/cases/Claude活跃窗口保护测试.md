---
title: Claude活跃窗口保护测试
document_type: test-case-list
status: ready
created: 2026-09-08
updated: 2026-09-08
issue: Issues看板与会话
---

# Claude活跃窗口保护测试

仅覆盖 REQ-028 的 WP0a，不替代全量命名、严格身份和可见性验收。预期来源：用户在位者活动规则、继续验证修复的授权、[实施方案](../../solutions/Claude在位会话活跃窗口保护方案.md)及 D-005。W=30秒为当前实现常量，测试其边界，不将它视为最优值。

| 功能 ID | 关联需求 | 功能点 | 是否测试 | 预期表现 | Test Case |
| --- | --- | --- | --- | --- | --- |
| F-255 | REQ-028 | 活跃在位者保护 | 是 | 竞争启动及后续事件均不能替换 | TC-255 |
| F-256 | REQ-028 | 窗口及续期 | 是 | 小于W拒绝，达到W沿用旧逻辑 | TC-256 |
| F-257 | REQ-028 | 原Provider行为 | 是 | 合法同ID子Agent、启动与其他Provider保留 | TC-257 |
| F-258 | REQ-014、REQ-028 | 冷恢复与生命周期 | 是 | 私有计时不重放、不跨实例、不假称liveness | TC-258 |
| F-259 | REQ-015、REQ-028 | relay与旧端入口 | 是 | 复用窗口；不新增wire字段 | TC-259 |
| F-260 | REQ-025、REQ-028 | 真实App投影 | 是 | 受保护身份对应标题与Issue attachment不跳 | TC-260 |

## TC-255 活跃在位者保护

- 关联需求：REQ-028；模块：Hook准入；优先级：P0；类型：规则/集成。
- 前置：独立listener，pane已有A的已接纳Claude Hook，age<W。
- 数据：不同ID的B，分别为SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop。
- 步骤：依次发B完整序列；再单独发不含SessionStart的B提示事件。
- 预期：各事件在Provider折叠/正常发布前拒绝；A的owner、状态、prompt、路径不变；B不能使A活动时间续期。

## TC-256 窗口边界与续期

- 关联需求：REQ-028；模块：活动窗口；优先级：P0；类型：单元。
- 前置：使用可控单调时钟，A在t0收到Hook。
- 数据：age=W-1、W、W+1；A后续工具事件；墙钟跳变。
- 步骤：每个边界发不同ID的B启动；重置后A在W内发事件，再重复边界；只改变Date.now不改单调时间。
- 预期：age<W拒绝、age>=W交给旧逻辑；仅A被接受的Hook续期；墙钟不改变判定。长任务静默后的误放和快速重开的误拦都属于策略可出现的结果，不将静默断言为exited。

## TC-257 既有Provider兼容

- 关联需求：REQ-028；模块：Provider normalizer；优先级：P0；类型：回归。
- 前置：独立pane，分别有/无在位者。
- 数据：A的startup/resume/clear、compact/unknown source、child SessionStart、同父ID SubagentStart/Stop、Codex主/子Hook、缺session ID。
- 步骤：分别发送并观察正常归一化结果与roster。
- 预期：首次及同ID合法启动保留；原source/child过滤不被绕过；合法同父ID子Agent仍展示；Codex child仍不发布自己的providerSession；缺ID沿用旧逻辑，不据此猜测角色。

## TC-258 恢复、重放与pane生命周期

- 关联需求：REQ-014、REQ-028；模块：listener私有状态；优先级：P0；类型：单元/集成。
- 前置：A已接纳；准备冷恢复状态和独立listener。
- 数据：同ID replay、relay spool、错误tab、pane remap/teardown/reset、其他身份的旧时间、OSC状态。
- 步骤：分别重放、移位、清理与创建新实例；每次发B竞争事件检查窗口。
- 预期：重放/未接纳事件/OSC不刷新活动；冷恢复缺时沿用旧逻辑；remap保留原观察时间；teardown/reset清空；旧时间不借给其他ID/pane/listener；活动map本身不构成状态/liveness claim。

## TC-259 relay与混合版本入口

- 关联需求：REQ-015、REQ-028；模块：relay HTTP/main remote ingest；优先级：P0；类型：集成。
- 前置：独立relay与main、认证HTTP端口；模拟旧relay只转发原normalized envelope。
- 数据：A后接B完整序列、spool恢复、窗口过期的B。
- 步骤：通过HTTP发到relay；另将未执行新guard的B envelope直接送main远端入口。
- 预期：活跃窗口内relay不正常转发B，main旧端入口也不接管；窗口到期B可按原逻辑发布；spool不续期，私有计时不出现在wire。双旧端及真实SSH断线部署需另行实测，不由本例保证。

## TC-260 后台真实App标题与attachment

- 关联需求：REQ-025、REQ-028；模块：Workspace、Tab、Issues；优先级：P0；类型：Electron E2E。
- 前置：一次性profile/HOME与测试Workspace；后台hidden App；固定A/B Provider名称fixture；不用用户会话或真实凭证。git worktree与folder Workspace按实际执行环境分别记录，不能互相代表。
- 数据：独立headless fixture进程发HTTP Hook，不将其称为真实Claude CLI。
- 步骤：建立A，进入Workspace/Issues观察标题和attachment；A刚有Hook时发B完整序列并连续观察；发同父ID子Agent；等待超过W无A事件，再发B启动。
- 预期：窗口内A身份、Tab/左侧名字、Issues attachment保持；同父子Agent保留；静默到期可沿旧逻辑切B；各核心状态由DOM与截图支持，store/RPC仅作身份旁证；不激活用户桌面窗口。
