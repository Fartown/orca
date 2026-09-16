---
title: "富文本Markdown强制打开"
slug: "富文本Markdown强制打开"
status: testing
created: 2026-09-16
updated: 2026-09-16
external_ids: []
---

# 富文本Markdown强制打开 开发 Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [requirements/富文本Markdown强制打开.md](requirements/富文本Markdown强制打开.md) | ready | REQ-401～REQ-403；非目标已写明不动往返检测本身 |
| 交互 | - | not-required | 复用同文件既有回落横幅与「仍然打开」按钮样式，无新控件 |
| 调研 | - | not-required | 拦截链路在本 journal §2 D-002 内记录，范围小于一篇独立调研 |
| 方案 | - | not-required | 单模块 + 3 接缝，设计写在 D-001～D-003 |
| 测试用例 | [tests/cases/富文本Markdown强制打开功能测试.md](tests/cases/富文本Markdown强制打开功能测试.md) | ready | TC-601～TC-606 单元规格，TC-607 真机规格 |
| 测试记录 | - | pending-decision | 单元已全绿；TC-607 真机验证待补 |

## 2. 决策点记录

### D-001 复用 `markdownRichModeSizeOverride` 而不是新增覆盖字段

- 日期：2026-09-16
- 背景：语法覆盖可以新开一个 per-file 记录，也可以复用体积回落已有的那个
- 最终决定：复用
- 原因：新增记录要同步改 12 处上游清理/重键/持久化站点（purge、rekey、close、open-apply、recently-closed、workspace-editor-item 等），否则按 fileId 泄漏；而两个门禁在语义上是同一个问题「用户是否接受在这个文件上打开富文本」，大文件含 HTML 时本来就同时触发，问两遍没有收益
- 影响范围：REQ-401；代价是字段名 `...SizeOverride` 比它现在的职责窄，记录在此处而非改名

### D-002 覆盖判定以已解析的横幅文案为键，而不是 reason 枚举

- 日期：2026-09-16
- 背景：render model 只拿得到 `unsupportedMessage`，拿不到 `unsupportedReason`（缓存模块没导出 decision）
- 最终决定：以文案为键，并用测试钉住等价性
- 原因：三个可覆盖 reason 都解析出非空文案，`other` 解析为 `null`，因此「文案非空」与「reason 可覆盖」等价；改成 reason 键需要再开一个上游接缝导出 decision，换不来行为差异
- 影响范围：REQ-401；等价性由 TC-604 保护，任一侧变化都会红

### D-003 强制期间常驻提示，而不是只在点击时警告一次

- 日期：2026-09-16
- 背景：覆盖是 per-file 且随标签页状态持久化的，点一次之后可能长期生效
- 最终决定：富文本编辑器 header slot 常驻一条提示
- 原因：被防的是「保存时静默改写源文件」，风险发生在每一次保存，不是在点击那一刻；一次性弹窗无法覆盖后续会话
- 影响范围：REQ-402；用 muted token + `TriangleAlert` 图标，不用同文件预览分支那套 raw amber（STYLEGUIDE 明确不复制既有债）

## 3. 开发记录

### 2026-09-16 放开语法不支持的硬拦截

- 本轮目标：把「只能在代码模式下编辑」从硬拦截改为用户可显式承担的选择，三类提示全覆盖，并在强制期间保持风险可见
- 完成内容：
  - 新增 feature 自有模块，承载可覆盖 reason 清单与「覆盖后状态」解析
  - render state 增加 `richModeUnsupportedOverrideActive`，render model 接入覆盖解析
  - Markdown 编辑面在两类回落上都渲染「仍然打开」，并在富文本模式常驻风险提示
  - 补齐 `zh.json` 的 `editor.richMarkdown` 文案组
  - 登记 feature、策略、`.gitignore` 放行与需求/用例文档
- 代码或文档变更：`src/renderer/src/components/rich-markdown-override/`（新增模块与测试）、`src/renderer/src/components/editor/markdown-render-mode.ts`、`editor-panel-render-model.ts`、`EditorMarkdownFileSurface.tsx`、`EditorContent.markdown-classification.test.tsx`、`EditorContent.monaco-lifecycle.test.tsx`、`editor-panel-render-model.test.ts`、`src/renderer/src/i18n/locales/en.json`、`zh.json`、`config/fork-features.jsonc`、`config/architecture-policies.jsonc`、`.gitignore`、本目录文档
- 验证证据：`pnpm tc` 通过；`pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/editor src/renderer/src/components/rich-markdown-override` 220 文件 1507 用例通过；feature checks、`check:architecture-policies`、`check:fork-features`、`check:fork-docs`、四项本地化门禁通过
- 未解决问题：TC-607 真机动线尚未在打包应用上走一遍
- 下一步：补 TC-607 真机验证记录，然后开 PR 合回 `fork/integration`
