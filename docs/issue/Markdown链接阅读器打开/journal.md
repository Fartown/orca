---
title: Markdown链接阅读器打开
document_type: journal
status: testing
external_ids:
  - 'Fartown/orca#154'
created: 2026-11-24
updated: 2026-11-24
---

# Markdown链接阅读器打开

## 1. 关键文档链接

| 类型     | 文档                                            | 状态         | 说明                                               |
| -------- | ----------------------------------------------- | ------------ | -------------------------------------------------- |
| 需求     | [需求](requirements/requirement.md)             | ready        | REQ-1541 至 REQ-1544                               |
| 交互     | -                                               | not-required | 不加界面，只改打开时的模式                         |
| 调研     | -                                               | not-required | 原因已在 Issue #154 中写明                         |
| 方案     | -                                               | not-required | 复用默认模式设置和已有的跳行逻辑                   |
| 测试执行 | [本地与SSH](tests/runs/2026-11-24-本地与SSH.md) | completed    | 本地、SSH 真机通过；手机端单测通过，真机待合入后验 |
| 测试用例 | [链接打开模式](tests/cases/链接打开模式.md)     | ready        | 本地、SSH 和手机                                   |

## 2. 决策点记录

### D-001 带行号的 md 链接保持阅读模式，不跳行

- 日期：2026-11-24。
- 背景：上游规则是点开带行号的 md 链接就强制切到源码再跳行。智能体引用文件时几乎都带行号，导致用户点开的 md 都是源码。
- 备选项：
  1. 带行号时仍用阅读模式打开，只是不跳行；
  2. 加一个开关，让 md 链接一律用阅读模式打开。
- 最终决定：用户选 1。已在源码的标签（含默认模式设成源码）照旧跳行。
- 原因：用户读 md 主要用阅读模式。跳行是源码才有的能力，不该反过来决定用什么模式打开。
- 影响范围：REQ-1541 至 REQ-1544。快速打开、检查注解、Notes、手机驱动的定位请求不变（REQ-1543）。
- 机器归属：模式是客户端渲染状态，默认模式是客户端设置。文件和 stat 都在原执行主机上，本地在本机，SSH 在 SSH 主机，沿用现有 RPC。没有新增配置、服务、端口、环境变量或定时器。

## 3. 开发记录

### 2026-11-24 真机验证（testing）

- 本轮目标：在本地和 SSH 工作区真机验证 REQ-1541 至 REQ-1543，在单测层面守住手机端的 REQ-1544。
- 完成内容：本地 TC-1541/1542/1543 通过，SSH TC-1541/1542 通过。手机端补了 hook 渲染测试 `mobile/src/markdown-link-reader/`，已登记进 tests 和 checks。修掉了测试里的类型断言（质量门禁报出的 3 处）。
- 代码或文档变更：手机端测试；登记表新增手机端的 ownedPaths、tests、checks；两条范围规则；测试执行记录。
- 验证证据：`tests/runs/2026-11-24-本地与SSH.md`，原始证据在 `/Users/bytedance/dev/orca/.docs/markdown-link-reader-ui-validation/2026-11-24/`。手机端单测 2 项通过，改回旧代码后 2 项失败。
- 未解决问题：
  - 手机真机要用这个分支打出的包，放到合入后用集成包验证。
  - `check:changed` 里 layout-writer 和 main-blocking-sqlite 两项棘轮报红，命中的是 `fork/integration` 上 11-21 同步留下的未登记基线（终端恢复与 local-tasks），不是本功能的问题，在 `fork/integration` 上单独修。
- 下一步：基线修复推到 `fork/integration` 后，把本分支变基上去，提 PR（Fixes #154）。

### 2026-11-24 登记与实现（implementing）

- 本轮目标：修复 Issue #154，完成本地、SSH 和手机端验证后合入。
- 完成内容：新增自有模块 `revealsLinkedMarkdownLine`，判断规则是先看标签存下的模式，没有就用默认模式；只有结果是源码时才跳行。电脑端三个链接入口（终端/聊天视图/机器人共用的 `openLinkedFileInEditor`、富文本 md 内链接、md 预览内链接）都不再强制切源码。手机端 md 预览始终先显示阅读模式。
- 代码或文档变更：`src/renderer/src/markdown-link-reader/` 新增模块和行为测试；四个上游接缝；登记表、架构策略和 `.gitignore`；需求和测试用例。
- 验证证据：行为测试 4 项通过；把终端入口改回旧代码后其中 3 项失败。
- 未解决问题：门禁和真机验证还没跑。
- 下一步：跑门禁，做本地、SSH、手机真机验证，然后提 PR。
