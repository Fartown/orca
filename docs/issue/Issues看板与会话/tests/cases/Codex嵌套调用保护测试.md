---
title: Codex嵌套调用保护测试
document_type: test-case-list
status: ready
created: 2026-09-09
updated: 2026-09-10
issue: Issues看板与会话
---

# Codex嵌套调用保护测试

关联REQ-028与D-006；只覆盖已实证的工具调用者上下文，不替代全量身份与命名验收。预期在本轮修复前由真实FAIL及冻结的[执行计划](../../../../../.docs/codex-owner-fix-ui-validation/2026-09-09/test-plan.md)定义，此处归档为稳定编号。

## TC-261 独立嵌套Hook不进入父pane

- 关联需求：REQ-028；优先级：P0；类型：生产脚本集成。
- 前置：managed Codex Hook继承CODEX_THREAD_ID=A，payload的session_id=B。
- 步骤：执行B的SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop；分别覆盖可用/不可用端点、1MB输入与精简PATH，检查Windows脚本分支。
- 预期：完整消费stdin后成功返回；不发HTTP、不写spool。Windows使用既有stdin drain，无新增解释器；A/原生子Agent无调用者变量时仍上报，主会话离线spool不退化。

## TC-262 新Orca pane不继承宿主调用者身份

- 关联需求：REQ-028；优先级：P0；类型：环境单元/集成。
- 前置：Orca宿主继承外层CODEX_THREAD_ID，保留Provider home与新的pane环境。
- 步骤：通过local/daemon/relay的新PTY环境路径，覆盖二次augment/rescrub；Windows环境键按大小写不敏感检查。
- 预期：仅新PTY环境中的调用者变量被清理，宿主process.env及其他Provider/pane变量不改；A之后真正启动工具子进程时注入的CODEX_THREAD_ID不被清理。
- 证据层级：local/daemon直接函数及relay既有回归为自动化证据，真实SSH/Windows运行另行验收。

## TC-263 真实主会话、子调用和合法重开

- 关联需求：REQ-025、REQ-028；优先级：P0；类型：隐藏Electron与真实Codex CLI。
- 前置：独立profile/HOME/Provider目录；App主动带外层线程sentinel，夹具不清该变量；正常New tab → Codex入口，实际模型/工具/Hook，不恢复旧thread或手工POST。
- 步骤：C1创建A并绑定Issue；C3真正spawn_agent；C2由A真实工具启动独立exec B；A真实Stop且CLI PID exited后，在同一PTY正常启动新C（C4）。连续保存main/renderer身份、rollout、标题槽、DOM、attachment及issueId。
- 预期：A/原生child/C Hook caller为空，B caller为A；C3/C2全程不抢父身份/标题/attachment，不纳管B或spool B；C4不等待30秒即可成为新身份，A保留原Issue但不继续attached，C不继承A Issue。
- 边界：标题槽真实来自首prompt时据实记录，不冒充原生人工名；采样不是逐帧或原子证明；所有交互式TUI、未知旧版本、wrapper人为覆盖变量不由本例保证。

## TC-266 正常启动的内部标题任务不替换主会话

- 关联需求：REQ-025、REQ-028；优先级：P0；类型：接收层回归与真实Codex TUI核心流程。
- 前置：隔离Orca正常New tab → Codex创建A，自身Hook携带transcript_path；Codex自动创建不持久化的标题任务B，其SessionStart不带prompt且transcript_path为空。
- 步骤：保留真实A Start/Prompt → B Start/标题模板Prompt → A Stop → B Stop入口和accepted事件；再通过原生 `/rename` 改A名，检查Provider原生文件、当前SID与Top/Workspace左侧/普通Dashboard。
- 预期：B Start不能凭缺失的transcript替换已有有transcript的A；已有严格标题模板判据识别B后，后续无prompt事件也不写主pane。A的prompt/model/identity保持自身证据；原生改名后三处显示一致且身份仍A。
- 自动回归：`src/main/codex-session-ownership/codex-title-task-admission.test.ts`，包含原始normalizer和旧relay归一化入口的顺序反例，分别先RED；不以只有最终名字相等替代中间身份未变。
- 边界：本例基于已采集Codex 0.154.0的真实核心序列，不把缺少transcript普遍等同于内部调用，不声称未知Provider版本或任意后台任务均已验收。
