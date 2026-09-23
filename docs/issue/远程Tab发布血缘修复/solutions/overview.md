---
title: "远程Tab发布血缘修复方案"
document_type: solution
status: approved
created: 2026-09-23
updated: 2026-09-23
---

# 远程Tab发布血缘修复方案

## 1. 摘要与当前结论

远程会话 Tab 同步以 `(publicationEpoch, snapshotVersion)` 排序:epoch 标识**发布者世代**,version 在同一世代内排序内容。客户端(`src/renderer/src/runtime/web-session-tabs-sync/`)把被新 epoch 顶替的旧 epoch 永久退役(仅内存,重启清空)。

`src/main/runtime/` 的 8 处 headless 写路径在持有既有快照的情况下,每次内容修改都铸造新 `headless:<时间戳>` epoch——把内容修改错误表达成发布者换代。renderer 世代存活时,客户端随即将其永久误退役,主机后续正常发布被全部拒收,表现为远程 Tab 不同步、该工作区终端每发一条消息就触发"重新连接到远程运行时"并重订 PTY 流(REQ-704 证据链)。

上游 #19860 已修复其中 1 处(`closeHeadlessMobileTerminalTab`)并确立规则:**写内容不换发布者;epoch 只在无可继承快照时铸造**。本方案把同一规则补齐到其余 7 处(4 个文件),每处附"epoch 不变、version +1"回归测试。

## 2. 设计原则

- **最小语义修正**:只改 epoch 的取值,不改 wire 格式、不改客户端合并逻辑、不改持久化结构。字符串契约保持原样。
- **与上游规则同文**:修复方式与上游 #19860 及 `getMergedMobileSessionPublicationEpoch` 的既有注释("The epoch identifies the publisher generation… Content changes are ordered by snapshotVersion")逐字对齐,降低上游回流冲突。
- **保留旧帧防护**:退役围栏只拦"真·旧发布者";同血缘内的乱序/延迟帧由 version 比较处理(客户端既有能力,`tracking-decisions.ts:108-116`)。

## 3. 仓库规范与当前逻辑

- 主机快照写路径集中在 `src/main/runtime/orca-runtime-*.ts`(`@ts-nocheck` 机械拆分文件),统一经 `storeMobileSessionSnapshot` + `emitMobileSessionTabsSnapshot` 落库并广播。
- epoch 消费者:
  - 客户端:`publisher-identity-fences.ts`(退役名单)、`tracking.ts` / `tracking-decisions.ts`(接收与合并决策);
  - 主机:`isHeadlessMobileSessionPublication` / `isHeadlessBuiltMobileSessionPublicationBase`(物化与保留决策)、`orca-runtime-sync-mobile-session-tabs.ts`(renderer 发布的接收门槛,只与 renderer 自己的 accepted (epoch, version) 对比较,与本修复无关)。
- 既有先例:`orca-runtime-create-runtime-owned-mobile-session-terminal.ts` 的 `existing?.publicationEpoch ?? headless:<新>`——有快照继承就沿用,没有才铸造。本方案把它推广为全部写路径的统一规则。

## 4. 复用与扩展策略

不新增模块。每处修复都是把

```ts
publicationEpoch: `headless:${Date.now().toString(36)}`,
```

替换为沿用传入快照的 epoch(带一行 Why 注释,与上游注释同义):

```ts
// Why: the epoch names the publisher generation; a headless content edit
// bumps the version, minting a fresh publisher fences live renderer frames.
publicationEpoch: snapshot.publicationEpoch,
```

`snapshotVersion: snapshot.snapshotVersion + 1` 保持不变。

## 5. 仓库改动总览

| 文件 | 位置 | 写路径 | 可达性 | 关联 REQ |
| --- | --- | --- | --- | --- |
| `src/main/runtime/orca-runtime-close-structured-agent-session-tab.ts` | `retireRuntimeOwnedBrowserSessionTab` | 浏览器 Tab 退役(租约围栏) | **renderer 存活可达**(现行投毒路径) | REQ-701/702 |
| `src/main/runtime/orca-runtime-move-headless-mobile-session-tab.ts` | reorder / split / move-to-group 三处 | Tab 拖动排序、拆组、移组 | 仅无权威 renderer 时可达(一致性加固) | REQ-701/702 |
| `src/main/runtime/orca-runtime-persist-headless-session-tab-props.ts` | `applyHeadlessSessionTabPropsToSnapshot` / `applyHeadlessTerminalPaneLayoutToSnapshot` | 置顶/改色/视图模式、分屏布局 | 仅无权威 renderer 时可达(一致性加固) | REQ-701/702 |
| `src/main/runtime/orca-runtime-apply-mobile-session-tab-navigation.ts` | `activateHeadlessMobileSessionTerminalTab` | 激活切换 | 仅无权威 renderer 时可达(一致性加固) | REQ-701/702 |
| `src/main/runtime/headless-sibling-writers-keep-publication-epoch.test.ts` | 新增 | 5 条回归用例 | REQ-703 |

`closeHeadlessMobileTerminalTab` 不在改动内:上游 #19860 已修并带测试 `headless-close-keeps-publication-epoch.test.ts`,随分支更新(至 `origin/fork/integration` `144f0ac71b`)合入。

## 6. 系统交互与影响分析

修复前(以关闭为例,其余写路径同构):

```text
renderer 发布 epoch=R v10 → headless 关闭写入 epoch=headless:H v11
→ 客户端退役 R → renderer 正常发布 R v12 → 客户端判 R 已退役,永久拒收
→ Tab 列表冻结;该工作区每次消息/状态发布都撞上卡死状态,终端反复重订
```

修复后:

```text
renderer 发布 epoch=R v10 → headless 写入 epoch=R v11(只递增 version)
→ 客户端同血缘比较 version,正常应用 → renderer 发布 R v12,正常应用
```

真·发布者换代(主机进程重启)由 `sessionTabsRuntimeHistoryByEnvironment`(runtimeId 围栏)独立处理,不经过 epoch 铸造,能力无损。

对主机侧 epoch 谓词的影响已逐点核对:写后 epoch 与写前相同,`isHeadlessBuiltMobileSessionPublicationBase` 等分类结果与写前一致,物化/保留决策不发生漂移。

## 7. 接口、数据与状态

- wire 格式不变:`publicationEpoch` 仍为字符串,`:headless-merge:` 血缘标记规则不变。
- 持久化:`storeMobileSessionSnapshot` 写入内容不变(仅 epoch 字段取值不同),无迁移。
- 客户端内存退役名单:不新增清理逻辑;已被旧构建投毒的客户端随升级重启自然恢复(见 Q-701 的后续增强选项)。

## 8. 错误、重试、恢复与降级

- 无快照可继承时(新建 runtime-owned Tab)维持既有 `?? headless:<新>` 回退,行为不变。
- 客户端收到 version 倒退的同血缘帧时按既有规则拒收(旧帧防护),不受本修复影响。

## 9. 监控、风险与测试关联

- 风险:某条写路径依赖"每次写入换 epoch"做隐式去抖——已全量检索 epoch 消费者(§3),无此依赖;runtime 聚合套件 1292 用例全绿佐证。
- 测试:每条修复点一条"epoch 不变、version +1"用例(TC-701～TC-705),逐一回退对应修复时用例失败(mutation 验证);`orca-runtime.test.ts` 聚合套件为回归底座(TC-706)。
- 现场验收:升级构建后在 mbp5 ↔ mini 环境复现原操作序列(关闭/移动远程 Tab 后发消息),确认不再弹重连横幅(TC-707)。

## 10. 变更记录

- 2026-09-23:初始版本,随实现一并落地(REQ-701～REQ-703 已实现)。
