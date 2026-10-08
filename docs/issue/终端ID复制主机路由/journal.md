---
title: "终端 ID 复制主机路由"
slug: "终端ID复制主机路由"
status: done
created: 2026-10-08
updated: 2026-10-08
external_ids: []
---

# 终端 ID 复制主机路由开发 Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [需求](requirements/终端ID复制主机路由.md) | ready | REQ-901～REQ-903 |
| 方案 | [方案](solutions/主机路由.md) | ready | 主机边界与协议复用 |
| 测试记录 | [记录](tests/runs/2026-10-08.md) | completed | 单元与 macOS 真机证据 |
| 测试用例 | [用例](tests/cases/主机路由.md) | ready | 本地、SSH、配对与失败隔离 |

## 2. 决策点记录

- 复用 terminal-handle-copy 的响应解析和剪贴板顺序；仅注入按所有者选择的 runtime 调用。
- 复用 terminal-worktree-route 的已有终端归属判定；不使用当前选中环境猜测远端。
- runtime 和 PTY 在执行主机，剪贴板在客户端。直接 SSH 由本机 runtime 代理；配对主机代理 SSH 时 RPC 发往配对主机。功能不读写远端文件、配置、环境变量或端口，不自建连接、重试与缓存。

## 3. 开发记录

### 2026-10-08 done

- 本轮目标：按 fork 流程修复 octo 配对终端复制 ID 的错误主机查询。
- 完成内容：基于最新 fork/integration 18682737fd 建立独立分支；完成源工作区路由、镜像 Tab ID 转换、可达性保护和 pairing revision 绑定。
- 代码或文档变更：功能目录、两个菜单接缝、注册表、架构策略和需求文档。
- 验证证据：16 项单元测试、类型检查、localization 和 fork 门禁通过；后台双实例与真实 SSH 的两项 Playwright 测试通过，见 tests/runs/2026-10-08.md。
- 未解决问题：纯上游基线的代码质量检查存在 310 项已合入历史问题；本次修复增量零新增。运行中的安装包未替换。
- 下一步：通过 fork PR 审核后随集成版本发布。
