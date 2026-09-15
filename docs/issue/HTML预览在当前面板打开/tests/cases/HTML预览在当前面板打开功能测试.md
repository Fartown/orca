---
title: HTML预览在当前面板打开功能测试
document_type: test-case-list
status: ready
created: 2026-09-15
updated: 2026-09-15
---

# HTML预览在当前面板打开功能测试

这是可重复执行的测试规格；实际结果另记入 `../runs/`。需求来源为 [HTML预览在当前面板打开](../../requirements/HTML预览在当前面板打开.md)。

## 1. 功能清单

| 功能 ID | 关联需求 | 功能点 | 是否测试 | 预期表现 | Test Case |
| --- | --- | --- | --- | --- | --- |
| F-01 | REQ-401 | 预览落在来源 pane 并激活 | 是 | `targetGroupId` 为来源分组，`activate: true`，不建分屏 | TC-601 |
| F-02 | REQ-402 | 来源分组缺失时的回退 | 是 | 回退到活动分组 | TC-602 |
| F-03 | REQ-403 | 远程工作区走文档 tab | 是 | `docLocation` 落在来源分组并激活 | TC-603 |
| F-04 | REQ-404 | 不可预览时可解释 | 是 | toast 显示原因，不建 tab；非预览语言静默返回 | TC-604、TC-605 |
| F-05 | REQ-405、REQ-406 | 真机行为与文案 | 是 | 面板不分屏，文案为「打开预览」 | TC-606 |

## 2. 用例

单元用例的实现位置：`src/renderer/src/components/file-preview-pane/open-file-preview-in-pane.test.ts`。

### TC-601 预览在来源分组内新建 tab 并激活

- 关联需求：REQ-401、REQ-405；优先级：P0；类型：单元；模块：预览落位。
- 前置条件：本地工作区，托管浏览器可用。
- 数据：`sourceGroupId: 'group-1'`，`filePath: '/repo/report.html'`。
- 步骤：调用 `openFilePreviewInSourcePane`。
- 预期：`createBrowserTab` 收到 `file:///repo/report.html` 且 `{ targetGroupId: 'group-1', activate: true }`；`createEmptySplitGroup` 未被调用。

### TC-602 来源分组为空时回退到活动分组

- 关联需求：REQ-402；优先级：P0；类型：单元；模块：预览落位。
- 前置条件：`activeGroupIdByWorktree['wt-1'] = 'group-active'`。
- 步骤：以 `sourceGroupId: null` 调用。
- 预期：`createBrowserTab` 的 `targetGroupId` 为 `group-active`。

### TC-603 远程工作区预览为文档 tab 且落在来源分组

- 关联需求：REQ-403；优先级：P0；类型：单元；模块：预览落位。
- 前置条件：repo 带 `connectionId: 'ssh-1'`。
- 步骤：以 `sourceGroupId: 'group-1'` 调用。
- 预期：`createBrowserTab` 收到空白 URL 与 `docLocation`，`browserRuntimeEnvironmentId: null`，`targetGroupId: 'group-1'`，`activate: true`。

### TC-604 无浏览器通道时提示原因且不建 tab

- 关联需求：REQ-404；优先级：P0；类型：单元；模块：预览落位。
- 前置条件：`managed-browser` 判定为 hidden，理由为一段文案。
- 步骤：调用。
- 预期：`toast.error` 收到该理由；`createBrowserTab` 未被调用。

### TC-605 非可预览语言静默返回

- 关联需求：REQ-404；优先级：P1；类型：单元；模块：预览落位。
- 步骤：以 `language: 'typescript'` 调用。
- 预期：既不建 tab 也不提示。

### TC-606 真机：点预览不分屏且文案为「打开预览」

- 关联需求：REQ-405、REQ-406；优先级：P0；类型：端到端；模块：编辑器头部。
- 前置条件：打包后的应用，后台启动（`ORCA_BACKGROUND_LAUNCH=1`），本地工作区内存在一个 HTML 文件。
- 步骤：打开该 HTML 文件 → 读取按钮 `aria-label` → 点击按钮 → 读取该工作区的分组数量与活动 tab。
- 预期：`aria-label` 为「打开预览」（英文界面为 `Open Preview`）；点击前后分组数量不变；活动 tab 变为预览 tab，且与源码 tab 同属一个分组。
