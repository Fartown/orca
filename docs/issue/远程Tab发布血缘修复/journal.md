---
title: "远程Tab发布血缘修复"
slug: "远程Tab发布血缘修复"
status: testing
created: 2026-09-23
updated: 2026-09-24
external_ids: ["stablyai/orca#19860"]
---

# 远程Tab发布血缘修复 开发 Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [requirements/requirement.md](requirements/requirement.md) | ready | REQ-701～REQ-704;Tab 同步根因已确认；发送后重连仍待验证 |
| 交互 | - | not-required | 无 UI 变更;为主机写路径语义修复 |
| 调研 | - | not-required | 现场诊断已由并行排查完成,证据在 `.docs/remote-tab-sync-ui-validation/2026-09-23/`(git 忽略);结论摘录于需求 §1/§8 与方案 §1 |
| 方案 | [solutions/overview.md](solutions/overview.md) | approved | 规则:写内容不换发布者,epoch 只在无可继承快照时铸造 |
| 测试用例 | [tests/cases/远程Tab发布血缘修复测试.md](tests/cases/远程Tab发布血缘修复测试.md) | ready | TC-707 已明确直接观测横幅与输入响应；daemon 为辅助证据 |
| 测试记录 | [tests/runs/2026-09-23-本地单元验证.md](tests/runs/2026-09-23-本地单元验证.md) | completed | TC-701～TC-706 PASS;聚合 1292 全绿 |
| 测试记录 | [tests/runs/2026-09-24-隔离双实例复验.md](tests/runs/2026-09-24-隔离双实例复验.md) | completed | 五组隔离对照已归档；TC-707 整体未完成 |

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

### D-703 按隔离实验收窄已证实结论

- 日期：2026-09-24。
- 背景：完整旧版可复现新 Tab 不显示，但既有终端连续输入正常；输出丢失阳性对照出现重连横幅时 daemon session-attached 仍为 0。
- 最终决定：保留 epoch 修复；撤回“发送后重连根因已确证”的说法；REQ-702/704 与整体保持 testing，TC-707 不标全量 PASS。
- 原因：Tab 快照同步与终端输出恢复的证据不能互相替代。
- 影响范围：需求背景、REQ-704/Q-702、方案现状、TC-707 的观测判据；用例判据已同步修订，验收须直接观测客户端横幅与输入回显。
- 关联文档：[隔离复验记录](tests/runs/2026-09-24-隔离双实例复验.md)。

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

### 2026-09-23 最新 integration 基线与出包准备

- 本轮目标:把已验证修复移植到最新 `fork/integration`,完成 PR 前门禁并触发新的 integration release
- 完成内容:
  - 从 `origin/fork/integration` `ef98278cfc` 新建独立 worktree,无冲突移植 4 个提交
  - 保留原 worktree 的未提交 `pnpm-lock.yaml`,未把依赖安装噪声带入本分支
- 代码或文档变更:
  - 功能代码与测试不变;补充最新基线复验记录
- 验证证据:
  - 定向 7 用例与 `orca-runtime.test.ts` 聚合 1292 用例通过
  - `pnpm tc`、fork feature、fork docs、architecture policy、四项 localization gate 通过
  - PR 增量 casting gate 0 findings;全 fork quality/type-aware/React Doctor 增量 0 findings
- 未解决问题:TC-707 仍需使用新发布包执行真机验收
- 下一步:创建 PR 合入 `fork/integration`,等待 `preview.28` 发布完成

### 2026-09-24 隔离双实例复验与验收纠偏

- 本轮目标：不操作用户正式 Orca，独立启动隐藏 App 验证 Kimi 修复及原始重连结论。
- 完成内容：从源码构建新旧两版；完成候选、单点旧写法、完整旧版、输出丢失阳性对照、新 host 配旧 client 五组测试；证实 Tab 同步改善，原始发送后重连尚未复现。
- 代码或文档变更：产品源码无变更；新增隔离测试脚本与证据（`.docs/`）；修正需求与方案事实描述、新增本轮测试记录；TC-707 判据已同步修订。
- 验证证据：五组 Playwright 场景断言通过，详见[复验记录](tests/runs/2026-09-24-隔离双实例复验.md)；阳性对照捕获 recovering 横幅；14 个临时目录、隔离 profile 与 App 进程均已清理。
- 文档门禁：check:fork-docs、check:fork-features、check:architecture-policies、task-leader 阶段校验与 git diff --check 均通过；本轮仅文档和隔离证据变更，未重复全量 typecheck。
- 未解决问题：Q-702 原始重连根因未证实；真实 agent/hooks、mini SSH 与其他 Tab 管理操作未完成验收；不具备发布完成依据。
- 下一步：保留本隔离环境，补现场 agent/hooks 与输出流诊断，不在正式 App 试错；补齐 TC-707 后再评估 done。


### 2026-09-24 PR 合码准备

- 本轮目标：按用户授权推进既有 PR #38 合入 fork/integration，保持正式 App 不受人工操作。
- 完成内容：在独立验证分支中移植复验文档到 PR #38 当前基线，保留原发布验证记录；修正功能登记的一句话目标，避免暗示原始重连原因已经确定。
- 代码或文档变更：文档与功能目标描述；产品源码相对 PR 原 HEAD 无变化。
- 验证证据：新 HEAD 的定向 7 条测试、fork docs/features/architecture、四项 localization 门禁通过；远端 typecheck、static analysis、macOS/Windows package 通过。本机额外全量 typecheck 收到 SIGKILL，未计为通过。
- 未解决问题：PR CI 唯一实际失败为已有 packaging job census 缺项；需先解除 #39/#40 的相互门禁阻塞。TC-707 和 Q-702 保持 testing。
- 下一步：基础分支修复通过后，更新 #38 并等待最终 HEAD 全部门禁，再执行 merge commit；不手动安装或重启用户 App。
