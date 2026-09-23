---
title: "远程Tab发布血缘修复"
slug: "远程Tab发布血缘修复"
status: testing
created: 2026-09-23
updated: 2026-09-23
external_ids: ["stablyai/orca#19860"]
---

# 远程Tab发布血缘修复 开发 Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [requirements/requirement.md](requirements/requirement.md) | ready | REQ-701～REQ-704;根因证据链与验收标准已确认 |
| 交互 | - | not-required | 无 UI 变更;为主机写路径语义修复 |
| 调研 | - | not-required | 现场诊断已由并行排查完成,证据在 `.docs/remote-tab-sync-ui-validation/2026-09-23/`(git 忽略);结论摘录于需求 §1/§8 与方案 §1 |
| 方案 | [solutions/overview.md](solutions/overview.md) | approved | 规则:写内容不换发布者,epoch 只在无可继承快照时铸造 |
| 测试用例 | [tests/cases/远程Tab发布血缘修复测试.md](tests/cases/远程Tab发布血缘修复测试.md) | ready | TC-701～TC-707;TC-707 为出包后真机验收 |
| 测试记录 | [tests/runs/2026-09-23-本地单元验证.md](tests/runs/2026-09-23-本地单元验证.md) | completed | TC-701～TC-706 PASS;聚合 1292 全绿 |

## 2. 决策点记录

### D-701 修复范围限定为"沿用现任 epoch",不做客户端自愈

- 日期:2026-09-23
- 背景:被旧构建投毒的客户端把仍在存活的 renderer epoch 永久列入内存退役名单,只能重启恢复;可在客户端加"权威确认后 revive"实现免重启自愈
- 最终决定:本需求只修主机写路径(断投毒源头);客户端自愈记为未决问题 Q-701,后续独立评估
- 原因:升级构建必然重启客户端,内存名单自然清空;自愈逻辑引入新的复活面,需要独立设计与验证
- 影响范围:REQ-701/702、方案 §7/§10、Q-701

#### 备选项

- 只修主机写路径(采纳)
- 主机修复 + 客户端自愈同批落地

#### 关联文档与需求点

- [需求 REQ-701/Q-701](requirements/requirement.md)、[方案 §7](solutions/overview.md)

### D-702 与上游 #19860 同文修复,不重构 epoch 语义

- 日期:2026-09-23
- 背景:epoch 是字符串契约,上游 #19860 已确立"epoch=发布者世代,内容修改只递增 version"并修复关闭路径;7 处兄弟写路径仍违反该规则
- 最终决定:逐点替换为 `snapshot.publicationEpoch`,注释与上游同义;不引入新字段、不改 wire
- 原因:最小语义修正,降低上游回流冲突;客户端合并逻辑零改动
- 影响范围:4 个 `src/main/runtime/orca-runtime-*.ts` 文件、REQ-701

#### 备选项

- 沿用现任 epoch(采纳)
- 统一封装"下一个 headless 快照"helper(不采纳:机械拆分文件保持与上游逐字结构,helper 反而增加接缝)

#### 关联文档与需求点

- [需求 REQ-701](requirements/requirement.md)、[方案 §4/§5](solutions/overview.md)

## 3. 开发记录

### 2026-09-23 兄弟写路径 epoch 血缘修复落地

- 本轮目标:把上游 #19860 的"写内容不换发布者"规则补齐到其余 7 处 headless 写路径,附回归测试
- 完成内容:
  - 分支更新到 `origin/fork/integration` `144f0ac71b`(带入上游 #19860 的关闭路径修复及其测试)
  - 7 处写路径改为沿用 `snapshot.publicationEpoch`(4 个文件:move×3、props×2、navigation×1、close-structured×1)
  - 新增 `src/main/runtime/headless-sibling-writers-keep-publication-epoch.test.ts` 5 条回归用例
  - 建立本需求文档链(需求/方案/测试用例/测试记录)
- 代码或文档变更:
  - `src/main/runtime/orca-runtime-move-headless-mobile-session-tab.ts`
  - `src/main/runtime/orca-runtime-persist-headless-session-tab-props.ts`
  - `src/main/runtime/orca-runtime-apply-mobile-session-tab-navigation.ts`
  - `src/main/runtime/orca-runtime-close-structured-agent-session-tab.ts`
  - `src/main/runtime/headless-sibling-writers-keep-publication-epoch.test.ts`(新增)
  - `docs/issue/远程Tab发布血缘修复/**`(新增)
- 验证证据:
  - 新增 5 用例 + 上游 2 用例:7 passed([测试记录](tests/runs/2026-09-23-本地单元验证.md))
  - `pnpm test src/main/runtime/orca-runtime.test.ts`:1292 passed / 1 skipped
  - 全仓检索确认除 `create-runtime-owned` 的合法 `??` 回退外无残留 `headless:${Date.now()}` 铸造点
- 未解决问题:Q-701(客户端自愈)未决;TC-707 真机验收待含修复的构建
- 下一步:提交分支、过 fork 门禁、出包后执行 TC-707
