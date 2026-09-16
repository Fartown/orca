---
title: "HTML预览在当前面板打开"
slug: "HTML预览在当前面板打开"
status: testing
created: 2026-09-15
updated: 2026-09-15
external_ids: []
---

# HTML预览在当前面板打开 开发 Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [requirements/HTML预览在当前面板打开.md](requirements/HTML预览在当前面板打开.md) | ready | REQ-401～REQ-406 |
| 交互 | - | not-required | 复用既有预览 tab 样式，只改落位与按钮文案 |
| 调研 | - | not-required | 链路已在上游 `src/renderer/src/lib/file-preview.ts` 内闭合，见决策点 D-101 |
| 方案 | - | not-required | 改动集中在一个落位函数与两个调用点，方案要点记在 D-101、D-102 |
| 测试用例 | [tests/cases/HTML预览在当前面板打开功能测试.md](tests/cases/HTML预览在当前面板打开功能测试.md) | ready | TC-601～TC-605 单元规格，TC-606 真机规格 |
| 测试记录 | [tests/runs/2026-09-15-预览落位真机验证.md](tests/runs/2026-09-15-预览落位真机验证.md) | completed | TC-601～TC-606 全部通过 |

## 2. 决策点记录

### D-102 按钮文案改为「打开预览」，上游的 props 名保持不动

- 日期：2026-09-15
- 背景：`canOpenPreviewToSide` / `onOpenPreviewToSide` 这两个 props 贯穿 EditorPanel、EditorPanelShell、EditorPanelHeader 三个上游组件
- 最终决定：只改用户可见文案与本功能自有函数名，上游 props 名保留
- 原因：改名要动三个上游文件、扩大 fork 与上游的 diff，并在每次 `pnpm sync:upstream` 制造冲突；收益只是内部命名
- 影响范围：REQ-406、seam `EditorPanelHeader.tsx` 与 `DiffSectionHeader.tsx`

#### 备选项

- 一并重命名 props 为 `onOpenPreview`
- 只改用户可见文案

#### 关联文档与需求点

- [需求 REQ-406](requirements/HTML预览在当前面板打开.md)

### D-101 新增功能自有的落位函数，不改写上游的 openFilePreviewToSide

- 日期：2026-09-15
- 背景：分屏行为写在上游 `openFilePreviewToSide` 里，它是 VS Code「Open Preview to the Side」语义的实现
- 最终决定：新增 `openFilePreviewInSourcePane`，两个调用点改指向它；上游函数原样保留
- 原因：改写上游函数会让它的名字与行为不符，且未来上游新增调用方时会静默继承 fork 的语义；新增函数只需把 `openDocPreviewTab` 导出这一处上游改动
- 影响范围：REQ-401～REQ-405，seam `file-preview.ts`、`EditorPanel.tsx`、`use-combined-diff-section-actions.ts`

#### 备选项

- 直接改写 `openFilePreviewToSide` 的落位逻辑
- 给它加一个「是否分屏」参数
- 新增功能自有的落位函数

#### 关联文档与需求点

- [需求 REQ-401～REQ-405](requirements/HTML预览在当前面板打开.md)

## 3. 开发记录

### 2026-09-16 补反向对照并在上游同步后复验

- 本轮目标：让本功能达到与 #23、#25 相同的证据标准——真机通过之外，还要证明用例不是空跑。
- 完成内容：把 `EditorPanel.tsx` 改回调用上游 `openFilePreviewToSide` 重新构建后跑同一条 TC-606，确认它在 `paneStrips → toHaveCount(stripsBefore)` 处失败（面板数由 1 变 2），随后还原复验通过。另：`fork/integration` 合入上游 1642 文件的同步后，本分支重新合入并全量复验。
- 代码或文档变更：`.docs/html-preview-current-pane-ui-validation/2026-09-15/evidence/00-before-fix-split-pane.png`；本 issue 测试记录新增 §3.1、§3.2。
- 验证证据：反向对照失败截图捕获到分屏右栏的 `RENDERED HTML` 标题——顺带填上了原先声明的「无法证明 HTML 像素渲染出来」这个缺口；合并上游后 `pnpm tc`、`check:fork-features`、`check:architecture-policies` 通过，TC-606 真机重跑通过。
- 未解决问题：远程工作区的预览落位与合并 diff 入口仍只有单测证据。
- 下一步：等待合入。

### 2026-09-15 实现落位函数与两个调用点

- 本轮目标：HTML 预览不再强制右分屏，改为在发起操作的 pane 内新建预览 tab 并切过去。
- 完成内容：新增功能自有模块 `src/renderer/src/components/file-preview-pane/open-file-preview-in-pane.ts`；把编辑器头部与合并 diff 段头部两个预览调用点改指向它；上游 `file-preview.ts` 只导出既有的 `openDocPreviewTab`；按钮文案改为「打开预览」并同步六个语言包；登记 fork 功能条目、架构策略与 `.gitignore` 放行。
- 代码或文档变更：`src/renderer/src/components/file-preview-pane/**`；`src/renderer/src/lib/file-preview.ts`；`src/renderer/src/components/editor/{EditorPanel.tsx,EditorPanelHeader.tsx,DiffSectionHeader.tsx}`；`src/renderer/src/components/editor/combined-diff/review-controls/use-combined-diff-section-actions.ts`；`src/renderer/src/i18n/locales/*.json`；`config/fork-features.jsonc`、`config/architecture-policies.jsonc`、`.gitignore`；本 issue 的需求与测试规格。
- 验证证据：单元 222 文件 1532 用例通过；真机 TC-606 通过——点击预览前后面板数均为 1，预览标签落在源标签同一分组并成为活动标签，按钮无障碍名为 `Open Preview`。证据在 `.docs/html-preview-current-pane-ui-validation/2026-09-15/evidence/`。`pnpm tc`、`oxlint`、三项 `verify:localization-*`、`check:architecture-policies`、`check:fork-features`、`check:fork-docs` 通过；`check:code-quality:changed` 为 319 项，与分支基线逐项相同，未新增。
- 未解决问题：远程工作区的预览落位只有单元证据（TC-603），真机需要远端主机；合并 diff 入口与编辑器共用实现，真机只验了编辑器一条。
- 下一步：提 PR 合回 `fork/integration`。
