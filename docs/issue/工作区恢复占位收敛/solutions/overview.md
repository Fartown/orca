---
title: 工作区恢复占位收敛实现设计
document_type: solution
status: ready
created: 2026-10-30
updated: 2026-10-30
---

# 工作区恢复占位收敛实现设计

## 范围与关联

落实 [REQ-2001、REQ-2002、REQ-2003](../requirements/requirement.md)，决策见 [D-001](../journal.md)。本轮修复重复 Unknown，不删除执行主机上的文件、项目、Git worktree 或进程。

## 之前与现在

之前：分区内的历史选择和访问记录进入主机归属表，恢复器为全部 ID 创建占位；成功目录更新移除 repo，留下工作区，分组显示 Unknown。

现在：归属表仍服务原有分区写入和冲突处理，但只有真实标签、文件、浏览器内容或可恢复 agent 能触发可见占位。成功且未过期的目录更新只收敛对应 runtime 主机的恢复工作区；空记录退出显示。有内容的记录保留原 repo 对象、名称和元数据；启动时尚无 repo 元数据则沿用既有路径名称占位构建。

## 复用与接缝

`src/shared/workspace-session-recovery/restorable-workspaces.ts` 按内容收集规范化工作区 ID，调用已有 `normalizeWorkspaceSessionKeyToWorkspaceId`，不改变原主机归属表。

`workspace-terminal-hydration.ts` 在已有 `buildRuntimeSessionPlaceholders` 调用前过滤可恢复 ID。文件夹 key 仍由已有 folder 恢复流程处理。

`src/renderer/src/workspace-session-recovery/restored-workspace-catalog.ts` 接收成功目录、原状态和明确 hostId；在已有 SSH readoption 结果上收敛。仅处理其 host 与恢复归属均匹配的行，保留其他主机同 ID 的行和已登记项目；保留有内容的 repo 对象及草稿。

`all-host-repo-catalog-actions.ts` 和 `runtime-repo-catalog-actions.ts` 在既有 generation、connection fence 和 removed-host 闸门之后接入。同名显示归并、原生项目身份、工作区归属和执行路由不改变。

## 机器归属和兼容

会话、草稿、恢复容器在客户端；项目目录、文件、PTY 和进程由执行主机持有。本地和直接 SSH 原有项目路径继续工作；嵌套 SSH 或 paired runtime 以原 hostId 处理。新模块不发网络请求，不创建端口、服务、环境变量或配置；失联和失败保留原状态。没有新 RPC 字段、stream opcode 或主机端代码，新旧客户端和主机互通方式不变。

移动端直接使用执行主机目录，本修复不改变 host 发布的项目/工作区内容；桌面恢复容器不重新登记到服务端。路径名称仍由已有跨平台函数处理，支持 Windows 路径和规范化 workspace key。

## 失败、降级和风险

远端目录读取失败、失联或结果被连接 fence 拒绝时，不执行收敛。恢复容器不会重新注册项目；主机已不登记工作区时，文件访问仍可能显示现有不可加载提示。编辑标签和草稿字节保留，不绕过主机文件访问授权。内容关闭后，在下一次成功目录刷新或重新启动时收敛空恢复容器。

收敛以主机和原恢复归属双重匹配，避免误删相同 ID 的其他主机行；对现存分区归属和历史字段不做破坏性迁移。回退本功能代码即可恢复原有逻辑，无持久 schema 回滚。

## 验证关联

[TC-2001、TC-2002、TC-2003](../tests/cases/恢复与目录.md) 分别覆盖空历史、主机目录与失败边界、内容与 SSH。单测经实际 store 恢复和目录 API 接线验证；隐藏 Electron 验证 DOM、目录移除和重启；SSH 通过认证 TCP 转发连接隔离主机实例。原用户应用只作前轮诊断，不注入本轮测试结果。

## 变更记录

2026-10-30：完成实现设计，明确恢复容器和不可读文件的边界。
