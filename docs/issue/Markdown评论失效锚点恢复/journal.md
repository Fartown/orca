---
title: Markdown评论失效锚点恢复
document_type: journal
status: done
external_ids:
  - 'Fartown/orca#79'
created: 2026-11-06
updated: 2026-11-06
---

# Markdown评论失效锚点恢复

## 1. 关键文档链接

| 类型     | 文档                                            | 状态         | 说明                                   |
| -------- | ----------------------------------------------- | ------------ | -------------------------------------- |
| 需求     | [需求](requirements/requirement.md)             | ready        | REQ-7901 至 REQ-7903                   |
| 交互     | -                                               | not-required | 复用评论卡片和已有栏，只补失效状态文案 |
| 调研     | -                                               | not-required | 已有真实数据和安装包复现               |
| 方案     | -                                               | not-required | 沿用引文匹配、布局与主机写入           |
| 测试执行 | [本地与SSH](tests/runs/2026-11-06-本地与SSH.md) | completed    | 同版本真实界面、主机读回、原事件回放   |
| 测试用例 | [锚点与评论访问](tests/cases/锚点与评论访问.md) | ready        | 本地和 SSH                             |

## 2. 决策点记录

### D-001 失效定位不能隐藏评论

- 日期：2026-11-06。
- 背景：旧行号未命中时在布局阶段丢弃了持久化评论。
- 备选项：清空计数/自动删除；复用引文匹配并保留失效卡片。
- 最终决定：采用后者。
- 原因：用户仍需要访问和处理原评论，不能丢失内容。
- 影响范围：REQ-7901、REQ-7902、REQ-7903；不改变存储协议或执行主机身份。
- 机器归属：本地文件与评论归本地主机，SSH 场景归原执行主机；客户端仅对已加载文本计算位置，继续使用原主机 RPC。无新增配置、服务、端口、环境变量或定时器；验证中的 SSH localhost 端口属于测试主机，认证转发仅属于隔离测试。

## 3. 开发记录

### 2026-11-21 上游同步到 fa60d0a566（done）

- 本轮目标：`fork/integration` 从 `e723de1bfd` 合入上游到 `fa60d0a566`（四次合并：`22afb84f6a`、`9c3b42f644`、`d725f407e8`、`31df22fb1a`，冲突都在第一次），保持锚点失效的评论不被隐藏（D-001）。
- 完成内容：本功能 4 个冲突（UU，含桌面 en/zh 词条表）。上游把富文本评论代码搬到 `editor/rich-markdown/review/`；`rich-markdown-review-note-positioning.ts` 保留 fork 的 `resolveMarkdownReviewAnchorPosition`，没有带入上游新增的 `findLast` 定位；`RichMarkdownReviewNoteLayer.tsx` 以上游为底重放失效标记。两边规则有冲突：上游把落在分隔行或超出文末的评论挂到上一块，fork 标为「原文已变化」且有自有测试锁定，本轮按 fork 规则保留。checks 原来顺带跑的 `rich-markdown-review-rail-blocks`、`rich-markdown-review-note-layout`、`rich-markdown-comment-blocks` 三个上游测试被上游删除（#38037），fork 未改过它们。合并后 e2e 修复提交 `69754a5a3f`：上游的评论写入接口新增归属参数，e2e 写入评论时传本机工作区归属（`authority.endpoint.kind: self`）。
- 代码或文档变更：`config/fork-features.jsonc` 接缝 3 条换路径（mustContain 不变）；checks 只留自有目录；`dependsOn` 5 条换路径。`tests/e2e/markdown-review-anchor-recovery.spec.ts`。新棘轮基线未登记本功能条目。
- 验证证据：登记 checks 1 文件 8 项通过（`/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/sync-checks-run3.log`）；冲突解法见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/report-E-files-preview-remote.md`、`phase2-E.tsv`；最终门禁见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/final-gates.log`。真机抽查（`/Users/bytedance/dev/orca/.docs/upstream-sync-ui-validation/2026-11-21/README.md`）未覆盖本功能，本机与 SSH 都没有做；`69754a5a3f` 改过的 e2e 在资料里没有运行记录。
- 未解决问题：上游与 fork 对「分隔行/文末评论」的处理不同，本轮保 fork，是否改随上游待定；e2e 修改后未见运行结果。
- 下一步：跑一次 `tests/e2e/markdown-review-anchor-recovery.spec.ts` 确认通过；需要时再定是否采用上游的挂上一块规则。

### 2026-11-06 实现与验证（done）

- 本轮目标：修复 Issue #79 并完成本地和 SSH 验证。
- 完成内容：在行号失效时复用引文匹配；引文移除或无法测量时保留卡片，显示原文已变更，复用卡片尺寸观察避免状态文案换行后重叠；原编辑、删除和主机写入路径保持。
- 代码或文档变更：功能拥有的锚点模块、三个上游接缝、中英文文案、注册和架构预算；需求、用例及 Test Run。
- 验证证据：21 项单测、四目标类型检查；本地和 paired UI 两项通过，认证 SSH 转发 UI 一项通过；原事件数据回放为计数 1、卡片 1，窗口隐藏且无焦点。详见测试执行文档。
- 未解决问题：用户正在运行的正式包尚未包含本轮变更；发布包需要随 integration 出包。
- 下一步：提交前最终门禁、PR CI 与合入。

### 2026-11-06 登记（implementing）

- 本轮目标：完成修复、真实验证与 PR 合入。
- 完成内容：确认 Issue #79 尚未修复；从最新 fork/integration 建立独立工作区并登记范围。
- 代码或文档变更：功能登记、接缝预算、需求、用例。
- 验证证据：2026-11-03 同版本 preview.68 复现：计数 1、展开后卡片 0；旧行号落在 248 与 250 之间。
- 未解决问题：实现及本地、SSH 验收尚待执行。
- 下一步：实现、门禁、真实验证、提交与合入。
