---
title: Issues 看板与会话
slug: Issues看板与会话
status: implementing
created: 2026-09-05
updated: 2026-09-05
external_ids: []
---

# Issues 看板与会话 Journal

## 1. 关键文档链接

| 类型     | 文档                                                                 | 状态         | 说明                                                                 |
| -------- | -------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------- |
| 需求     | [Issues 看板与会话](requirements/Issues看板与会话.md)                | ready        | 独立目标、范围、分级与 REQ-001～REQ-029                              |
| 交互     | -                                                                    | not-required | 本次仅整理既有文档，不创建新交互设计或修改 UI                        |
| 方案     | [Issues 看板与会话技术说明](solutions/Issues看板与会话技术说明.md)   | ready        | 看板、真实会话行、绑定与恢复、标题稳定化，同类旧稿的唯一有效技术正文 |
| 测试用例 | [功能测试](tests/cases/Issues功能测试.md)                            | ready        | TC-001～TC-230，保留编号及完整断言，不含执行结果                     |
| 调研     | -                                                                    | not-required | 已核对的实现链和源码索引在技术正文，本次不新建重复调研               |
| 历史执行 | [2026-08-30 App 验证](tests/runs/2026-08-30-Issues历史App验证.md)    | completed    | 冻结隔离 App 的历史结果，不证明当前标题实现已验收                    |
| 测试执行 | [2026-09-05 标题纯函数验证](tests/runs/2026-09-05-标题纯函数验证.md) | completed    | 原联合执行中的 5 项单测，仅迁移记录，没有重跑                        |

ready 只表示文档已按当前源码整理；本需求仍为 implementing，不等于当前产品已完成验收。

## 2. 决策点记录

### D-001 独立管理本需求

- 日期：2026-09-05。
- 背景：首次归并将三项独立能力放在一个总 issue 下；用户随后确认改为三个 issue。
- 备选项：一个总 issue 下设子需求；或三项独立 issue 配轻量索引。
- 最终决定：采用三个独立 issue；本目录只管理 Issues 看板与会话，技术、测试和目标分级随本需求归属。
- 原因：三项能力的目标、实现职责和验收边界独立，避免共享一个完成状态。
- 影响范围：REQ-001～REQ-029、本 Journal 及关联文档；原 REQ/TC 编号不变，不增加运行时耦合。

### D-002 保留已核对正文与证据边界

- 日期：2026-09-05。
- 背景：旧方案包含撤回目标、未实现提案和不同版本的测试结果。
- 备选项：按最新文件整篇替换；或保留逐条核对后的目标、现状和差距。
- 最终决定：沿用已核对正文及测试断言，历史证据保留执行版本与未覆盖项，不把文档拆分当作重新测试。
- 原因：文件日期、代码存在及历史 PASS 均不能证明当前产品完整交付。
- 影响范围：需求、技术说明、测试规格及本需求的执行证据。

## 3. 开发记录

### 2026-09-07 与 Goal 共用主进程注入点

- 本轮目标：首次用 `pnpm sync:upstream` 合并上游 268 个提交后跑 Issues 套件，修复暴露出的一处既有失败。
- 完成内容：`src/main/index.ts` 的 `afterTerminalRuntimeStartup` 自 Goal WP1 起是组合回调（先 `startIssueFeatureForMainProcess()` 再 `startGoalFeatureForMainProcess()`），`issue-host-lifecycle.test.ts` 仍按旧字面量查找而失败；改为在回调内查找 Issue 启动调用，顺序断言不变。
- 代码或文档变更：仅该测试文件与本记录。合并上游时 Issues 线另有两处接缝冲突已解决：`AiVaultVirtualRow.tsx`（上游从 `AiVaultSessionVirtualList.tsx` 拆出，canonicalTitle 接缝随之迁移并登记到 `config/fork-features.jsonc`）、`ai-vault-session-launch-actions.ts`（保留 fork 的 `resumeAiVaultSession`，解析器改回上游的 `ai-vault-session-launch-target.ts`）。
- 验证证据：Issues 相关 vitest 43 文件 175 例通过（见 `.docs/fork-sync/2026-09-07/`）；`pnpm check:fork-features` 与架构门禁通过。
- 未解决问题：无新增。
- 下一步：Issues 线继续在自己的功能分支推进，见 `docs/reference/fork-maintenance.md`。

### 2026-09-05 拆分独立 issue

- 本轮目标：按用户确认，将 Issues 看板与会话从总 issue 独立出来。
- 完成内容：迁移一份主需求、一份主技术说明、一份测试规格及本需求的已有证据；更新旧入口，不扩写新功能。
- 代码或文档变更：仅本 issue、相关导航、跨需求维护记录和窄范围 Git ignore 例外；原功能源码与暂存区不调整。
- 验证证据：本需求结构与链接校验、完整 REQ/TC 及正文保留校验记录在 `docs/maintenance/本地需求文档整理/2026-09-05-三需求拆分校验.md`；本次不重新执行功能测试。
- 未解决问题：当前 App 标题链、并发刷新、迁移及真实 SSH/Windows/Linux/paired runtime 仍需按范围验收；Node-only orcad 的生产装配缺口和其他后续目标见需求与技术正文。
- 下一步：后续仅在本 issue 内推进对应开发和验收，每次真实执行新增 Test Run。
