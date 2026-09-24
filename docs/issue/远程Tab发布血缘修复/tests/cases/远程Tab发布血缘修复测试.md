---
title: "远程Tab发布血缘修复测试"
document_type: test-case
status: ready
created: 2026-09-23
updated: 2026-09-24
---

# 远程Tab发布血缘修复测试

## 测试功能清单

| 功能 ID | 关联需求 | 功能点 | 是否测试 | 预期表现 | Test Case |
| --- | --- | --- | --- | --- | --- |
| F-701 | REQ-701/702 | 激活切换写路径 epoch | 是 | epoch 不变、version +1 | TC-701 |
| F-702 | REQ-701/702 | Tab 拖动排序写路径 epoch | 是 | epoch 不变、version +1 | TC-702 |
| F-703 | REQ-701/702 | Tab 属性(置顶/改色)写路径 epoch | 是 | epoch 不变、version +1 | TC-703 |
| F-704 | REQ-701/702 | 分屏布局写路径 epoch | 是 | epoch 不变、version +1 | TC-704 |
| F-705 | REQ-701/702 | 浏览器 Tab 退役写路径 epoch | 是 | epoch 不变、version +1 | TC-705 |
| F-706 | REQ-703 | runtime 聚合回归 | 是 | 全部用例通过 | TC-706 |
| F-707 | REQ-702/704 | 真机现场验收 | 是 | Tab 操作后发消息不弹重连横幅 | TC-707 |

## TC-701 激活切换沿用现任 epoch

- 关联 REQ:REQ-701、REQ-702
- 功能模块:`orca-runtime-apply-mobile-session-tab-navigation.ts` / `activateHeadlessMobileSessionTerminalTab`
- 优先级:P0;测试类型:单元(vitest)
- 前置条件:构造 `OrcaRuntimeService`(最小 store);`mobileSessionTabsByWorktree` 预置 epoch 为 `renderer-generation-1`、version 4、含两个终端 Tab 的快照
- 操作:调用 `activateHeadlessMobileSessionTerminalTab` 激活 tab-a
- 预期结果:
  1. 写后快照 `publicationEpoch === 'renderer-generation-1'`
  2. `snapshotVersion === 5`
  3. 回退该处修复后本用例失败

## TC-702 Tab 拖动排序沿用现任 epoch

- 关联 REQ:REQ-701、REQ-702
- 功能模块:`orca-runtime-move-headless-mobile-session-tab.ts` / `moveHeadlessMobileSessionTab`(reorder)
- 优先级:P0;测试类型:单元(vitest)
- 前置条件:同 TC-701,快照含 `tabGroups: [{id:'group-1', tabOrder:['tab-a','tab-b']}]`
- 操作:以 `{kind:'reorder', tabOrder:['tab-b','tab-a']}` 调用
- 预期结果:同 TC-701 三条

## TC-703 Tab 属性沿用现任 epoch

- 关联 REQ:REQ-701、REQ-702
- 功能模块:`orca-runtime-persist-headless-session-tab-props.ts` / `applyHeadlessSessionTabPropsToSnapshot`
- 优先级:P0;测试类型:单元(vitest)
- 前置条件:同 TC-701
- 操作:对 tab-a 应用 `{isPinned:true}`
- 预期结果:同 TC-701 三条

## TC-704 分屏布局沿用现任 epoch

- 关联 REQ:REQ-701、REQ-702
- 功能模块:`orca-runtime-persist-headless-session-tab-props.ts` / `applyHeadlessTerminalPaneLayoutToSnapshot`
- 优先级:P0;测试类型:单元(vitest)
- 前置条件:同 TC-701,tab-a 带 `parentLayout`
- 操作:对 tab-a 应用布局参数变更
- 预期结果:同 TC-701 三条

## TC-705 浏览器 Tab 退役沿用现任 epoch

- 关联 REQ:REQ-701、REQ-702
- 功能模块:`orca-runtime-close-structured-agent-session-tab.ts` / `retireRuntimeOwnedBrowserSessionTab`
- 优先级:P0;测试类型:单元(vitest)
- 前置条件:同 TC-701,快照另含一个 browser Tab(page-1)
- 操作:调用 `retireRuntimeOwnedBrowserSessionTab(worktreeId,'page-1')`
- 预期结果:同 TC-701 三条

## TC-706 runtime 聚合回归

- 关联 REQ:REQ-703
- 功能模块:`src/main/runtime/orca-runtime.test.ts`(聚合全部 runtime spec)
- 优先级:P0;测试类型:单元(vitest)
- 前置条件:worktree 含全部修复
- 操作:`pnpm test src/main/runtime/orca-runtime.test.ts`
- 预期结果:全部用例通过(含上游 `headless-close-keeps-publication-epoch` 与新增 sibling 用例)

## TC-707 真机现场验收

> 观测说明：daemon 无 session-attached 不能代替客户端无重连。验收需直接连续观测客户端重连状态并确认每条输入回显。

- 关联 REQ:REQ-702、REQ-704
- 功能模块:桌面端 ↔ paired runtime 远程工作区
- 优先级:P0;测试类型:真机手动
- 前置条件:桌面端与远程主机均运行含本修复的构建;远程工作区 renderer 世代存活;准备一个可牺牲的远程终端
- 操作步骤:
  1. 在远程工作区关闭一个 Tab、拖动调整分组、置顶一个 Tab
  2. 向远程 agent 终端连续发送 3 条消息
  3. 在远程主机上新建一个终端 Tab
- 预期结果:
  1. 步骤 2 中每条消息均确认收到终端响应，且连续观测期间不出现"正在重新连接到远程运行时"横幅
  2. 记录 mini 侧 daemon 日志在步骤 1/2 期间对应 `session-attached` 重挂事件，作为辅助证据；计数为 0 不能替代步骤 1 的客户端观测
  3. 步骤 3 的新 Tab 在桌面端出现
