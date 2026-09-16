---
title: "富文本 Markdown 强制打开 功能测试"
slug: "富文本Markdown强制打开功能测试"
status: ready
created: 2026-09-16
updated: 2026-09-16
---

# 富文本 Markdown 强制打开 功能测试

## 单元规格

### TC-601 未覆盖时保持回落（REQ-401）

- 前置：富文本视图，正文为 50,001 字符前缀 + `<span>text</span>`（超过往返验证预算，因此必然按不支持处理）。
- 期望：`renderMode` 为 `source`，`richModeUnsupportedMessage` 非空，`richModeUnsupportedOverrideActive` 为 `false`。
- 覆盖：`editor-panel-render-model.test.ts`。

### TC-602 覆盖后交给富文本编辑器（REQ-401）

- 前置：同 TC-601，per-file 覆盖标记为 `true`。
- 期望：`renderMode` 为 `rich-editor`，`richModeUnsupportedMessage` 为 `null`，`richModeUnsupportedOverrideActive` 为 `true`。
- 覆盖：`editor-panel-render-model.test.ts`。

### TC-603 纯体积覆盖不误报风险（REQ-402）

- 前置：无不支持语法、仅超过 600 KiB 的文档，覆盖标记为 `true`。
- 期望：`renderMode` 为 `rich-editor`，`richModeUnsupportedOverrideActive` 为 `false`。
- 覆盖：`editor-panel-render-model.test.ts`、`rich-markdown-unsupported-override.test.ts`。

### TC-604 消息键等价性（REQ-401）

- 描述：覆盖判定以「已解析的横幅文案」为键，前提是每个可覆盖 reason 都解析出非空文案、`other` 与 `null` 解析为 `null`。
- 期望：三个可覆盖 reason 解析结果为字符串；`other`、`null` 解析为 `null`。
- 覆盖：`rich-markdown-unsupported-override.test.ts`。

### TC-605 两类回落都渲染「仍然打开」（REQ-401）

- 前置：分别构造引用式链接回落与体积回落。
- 期望：两种横幅都能查到「Open anyway」按钮（此前语法回落查不到）。
- 覆盖：`EditorContent.markdown-classification.test.tsx`。

### TC-606 强制期间常驻风险提示（REQ-402）

- 前置：引用式链接文档 + 覆盖标记 `true`；对照组为纯体积覆盖文档。
- 期望：前者渲染 `rich-editor` 且能查到风险提示文案、查不到原回落文案；后者查不到风险提示。
- 覆盖：`EditorContent.markdown-classification.test.tsx`。

## 真机规格

### TC-607 真实文档上的完整动线（REQ-401、REQ-402、REQ-403）

- 前置：中文界面，打开一个 50 KB 以上、含 HTML 的 Markdown 文件，切到富文本视图。
- 步骤：观察回落横幅 → 点击「仍然打开」→ 观察富文本编辑器顶部提示 → 关闭并重开该标签页。
- 期望：
  - 横幅与按钮为中文，横幅文案即「只能在代码模式下编辑，因为该文件包含 HTML、JSX 或 MDX。」。
  - 点击后 Monaco 让位给富文本编辑器（`.ProseMirror` 出现、`.monaco-editor` 消失），回落横幅消失。
  - 富文本工具栏下方常驻中文风险提示。
  - 关闭再重开同一文件回到默认拦截态。覆盖的生命周期等于标签页：`close-file-action.ts` 在关闭时删除该 fileId 的覆盖标记（上游既有语义，本需求未改动），因此重开从安全默认重新开始。
