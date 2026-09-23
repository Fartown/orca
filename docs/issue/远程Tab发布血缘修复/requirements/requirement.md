---
title: "远程Tab发布血缘修复"
document_type: requirement
status: ready
created: 2026-09-23
updated: 2026-09-23
---

# 远程Tab发布血缘修复

## 1. 背景与目标

远程工作区(paired runtime)的会话 Tab 列表由主机以 `(publicationEpoch, snapshotVersion)` 发布、客户端订阅合并。`publicationEpoch` 的语义是"发布者换代":客户端把新 epoch 顶替掉的旧 epoch 永久列入退役名单(`sessionTabsPublicationEpochHistoryByWorktree`),退役即永久拒收,只在内存中、重启才清空。

2026-09-23 现场(桌面 mbp5 ↔ mini 的 octo 远程工作区)确认:13:50:44 一次普通的"关闭远程 Tab"操作,经 `closeHeadlessMobileTerminalTab` 把整个工作区快照的 epoch 从 `renderer:…` 改写为 `headless:<时间戳>`——一次内容修改被错误表达成发布者换代。客户端随即将仍在正常工作的 renderer epoch 永久退役,mini 后续用该 epoch 发布的全部帧被静默拒收。症状:远程新建 Tab 在桌面端不出现、已关闭 Tab 的僵尸句柄残留,且该工作区内**每发一条消息终端就弹"正在重新连接到远程运行时"横幅**并重订 PTY 流(空闲时连接完全稳定,发消息与重挂一一对应,有 daemon 日志与对照实验证据)。

上游 #19860(2026-09-18 合入,commit `5c2d3322c1`)已修复 `closeHeadlessMobileTerminalTab` 一处:关闭不再铸造新 epoch,并确立规则——**epoch 标识发布者世代,内容修改只递增 `snapshotVersion`**(`getMergedMobileSessionPublicationEpoch` 的既有注释与该提交的测试 `headless-close-keeps-publication-epoch.test.ts`)。但同语义的其余 headless 写路径仍在每次写入时铸造新 `headless:<时间戳>` epoch,相同的投毒机制仍可经这些路径复发。

目标:把"写内容不换发布者"的规则补齐到全部 headless 写路径,使任何 Tab 内容修改(移动、属性、布局、激活、浏览器 Tab 退役)都不再触发客户端误退役,消除"远程 Tab 不同步 / 发消息即重连"这一类故障的复发路径。

## 2. 用户场景

用户在桌面端连接 mini 上的远程工作区,同时使用移动端/桌面端管理远程 Tab(关闭、拖动分组、置顶、改色、切换激活、调整分屏),远程主机同时开着自己的桌面 UI(renderer 发布者存活)。任一内容操作后,远程 agent 终端应继续稳定工作:不发消息的时段连接不断,发消息不弹重连横幅;新建的远程 Tab 在桌面端正常出现。

## 3. 范围

### In Scope

- `src/main/runtime/` 下全部"在既有快照上做 headless 内容修改"的写路径的 epoch 处理(7 处,4 个文件):
  - `orca-runtime-move-headless-mobile-session-tab.ts`(reorder / split / move-to-group 三处)
  - `orca-runtime-persist-headless-session-tab-props.ts`(Tab 属性、分屏布局两处)
  - `orca-runtime-apply-mobile-session-tab-navigation.ts`(激活一处)
  - `orca-runtime-close-structured-agent-session-tab.ts`(`retireRuntimeOwnedBrowserSessionTab` 一处)
- 每条写路径的回归测试:renderer 世代存活时,写后 epoch 不变、version +1。
- 需求、方案、测试用例文档与 fork 功能登记。

### Out of Scope

- `closeHeadlessMobileTerminalTab` 本体(上游 #19860 已修,随分支更新合入)。
- 客户端退役名单的自愈/复活机制(`reviveRetiredValue` 的权威确认调用):已被旧版本投毒的客户端升级即重启、内存状态自然清空;自愈是独立增强,见未决问题 Q-701。
- epoch 语义的重构(如把"发布者世代"改为显式字段);保持字符串契约不变。
- 移动端、Web 客户端自身的合并/布局逻辑。

## 4. 需求点

### REQ-701 headless 内容修改不得更换发布者世代

- 目标级别：P0；当前状态：已实现（2026-09-23 单测通过，见 TC-701～TC-705）。
- 描述：所有持有既有快照的 headless 写路径,写后快照的 `publicationEpoch` 必须等于写前快照的 `publicationEpoch`(包括 `:headless-merge:` 形式的原样保留),`snapshotVersion` 递增 1。仅当没有可继承的快照时才允许铸造新 epoch(既有先例 `orca-runtime-create-runtime-owned-mobile-session-terminal.ts`)。

### REQ-702 误退役类故障不再经 Tab 管理操作复发

- 目标级别：P0；当前状态：测试中（单元层面已覆盖，真机验收 TC-707 待含修复构建）。
- 描述：在 renderer 世代存活的远程工作区执行关闭、移动、置顶/改色、分屏布局调整、激活切换、浏览器 Tab 退役后,客户端不得把该 renderer epoch 列入退役名单;主机后续以该 epoch 发布的帧必须被客户端正常接受。

### REQ-703 回归测试覆盖全部修复点

- 目标级别：P0；当前状态：已实现（2026-09-23 聚合套件 1292 通过，见 TC-706）。
- 描述：每条修复的写路径都有单元测试断言"epoch 不变、version +1";既有 runtime 聚合测试套件(`orca-runtime.test.ts`)保持全绿。

### REQ-704 现场故障链路有据可查

- 目标级别：P1；当前状态：已实现（证据链已归档并引用）。
- 描述：本需求根因(关闭 Tab 投毒 → 客户端永久误退役 → 远程 Tab 不同步 + 发消息即重连)的证据链保留在案:现场诊断报告、安装包回放脚本、daemon 日志时间线,引用 `.docs/remote-tab-sync-ui-validation/2026-09-23/`(git 忽略目录)。

## 5. 业务规则

- epoch 的变更只能表达"发布者换代"(主机进程重启由 runtimeId 围栏独立处理);内容修改一律只递增 `snapshotVersion`。
- 旧帧防护在同血缘内由 `snapshotVersion` 比较承担(客户端 `tracking-decisions.ts` 既有逻辑),不依赖 epoch 更换。
- `:headless-merge:` 后缀是同一发布血缘的既有标记,保留不动。

## 6. 验收标准

- 全部 7 处写路径的回归测试通过,且逐一回退对应修复时测试失败(mutation 验证)。
- `pnpm test src/main/runtime/orca-runtime.test.ts` 全绿。
- 升级到含本修复的构建后,远程工作区执行 REQ-702 列出的 Tab 操作后:不再出现"每发一条消息就弹重连横幅";远程新建 Tab 在桌面端可见。

## 7. 未决问题

### Q-701 客户端是否需要权威确认后的退役自愈

已被旧构建投毒的客户端目前只能重启恢复(退役名单在内存)。是否在"已退役 epoch 以更高 version + 相同 runtimeId 归来"时,经权威 `listAll` 确认后调用既有 `reviveRetiredValue` 解除误退役,使卡死客户端免重启自愈。**待确认**,作为后续独立增强,不阻塞本需求。

## 8. 已确认结论

- 根因链路(关闭 Tab 改写 epoch → 客户端永久误退役)已经现场日志、安装包回放两次证实(2026-09-23,另一排查会话的诊断报告与本会话的 daemon 日志对照实验)。
- 上游 #19860 的修复方向(关闭不换 epoch)与本需求一致;本需求是其规则向兄弟写路径的补齐(用户 2026-09-23 确认按此方向实施)。
- 修复期间分支已更新到 `origin/fork/integration` 最新(`144f0ac71b`),上游 #19860 已在分支内。

## 9. 外部来源

- 现场诊断报告:`.docs/remote-tab-sync-ui-validation/2026-09-23/README.md`(git 忽略目录,含回放脚本与证据 JSON)。
- 上游修复:[stablyai/orca PR #19860](https://github.com/stablyai/orca/pull/19860),commit [`5c2d3322c1`](https://github.com/stablyai/orca/commit/5c2d3322c1cb08c0ca71c9bf9b9a7596cded6ac7)。提交标题是终端识别问题,内含本次同步修复:关闭 Tab 删除强行生成新 headless 发布标识的代码(保留原标识、递增版本)、修正列表移除通知与同代发布标识的淘汰规则、新增 `headless-close-keeps-publication-epoch.test.ts`。注意:该提交信息称兄弟写路径已沿用 epoch,实际仍有 7 处在铸造新 epoch,即本需求的修复范围。

## 10. 需求变更记录

- 2026-09-23:初始版本。
