---
title: 创建链路诊断测试规格
document_type: test-case
status: ready
created: 2026-10-09
updated: 2026-10-20
---

# 创建链路诊断测试规格

| 功能 ID | 关联需求 | 功能点 | 是否测试 | 预期表现 | Test Case |
| --- | --- | --- | --- | --- | --- |
| F-801 | REQ-801 | 入口和请求关联 | 是 | 区分入口及并发请求 | TC-801 |
| F-802 | REQ-802 | 候选和创建结果 | 是 | 接回、创建、失败均记录 | TC-802 |
| F-803 | REQ-803 | 隐私和行为保持 | 是 | 脱敏、落盘、失败开放 | TC-803 |

## TC-801 入口与关联（P0，单元/接缝契约）

- 关联需求：REQ-801。
- 前置条件：启用独立临时目录的 trace sink；不启动生产应用。
- 测试数据：本地、paired runtime 调用方与 SSH connectionId；不同请求、相同 provider session；六类 renderer 入口。
- 操作：调用入口记录、创建 RPC 及嵌套 PTY 记录；并发执行两个请求；分别省略 params.requestId 和提供与 envelope 不同的 requestId，读取磁盘。
- 预期结果：入口名与安全调用位置保留；RPC accepted 在请求完成前可读且包含调用方和请求摘要；requestRef 始终来自 RPC envelope，不被参数缺失或冲突值覆盖；同请求沿用 traceId，不同请求不混；mirror/host 的 Tab 摘要一致。SSH 字段只作为归属证据，不触发本地 fallback。

## TC-802 候选与结果（P0，单元/既有回归）

- 关联需求：REQ-802。
- 前置条件：日志 sink 开启；候选来源使用已有状态和探测结果。
- 操作：分别输入 live / exited / unverifiable 探测；执行已有 materialized/preflight/reservation 接回测试、daemon 创建/attach/cancel 和失败测试；提供“原 Tab 不在列表但持久绑定还在”的记录。
- 预期结果：探测只调用一次，返回/抛出对象不变；所有入口接缝保留；原 pane 的可见性、renderer-live 映射与持久绑定分别记录，不从不可见推断进程退出；候选截断明确给出 omitted count。
- SSH 场景：失联探测抛错保持 unverifiable，记录不尝试本机或新建。

## TC-803 隐私与落盘（P0，单元/真实文件写入）

- 关联需求：REQ-803。
- 测试数据：假命令、prompt、credential、私有路径、任意异常正文。
- 操作：经过 renderer breadcrumb 的主机处理函数、main tracer 和 daemon file log 写入临时真实文件；移除/故障注入 sink，再运行同一请求。
- 预期结果：正文和凭据不出现在记录中；身份摘要及固定结果可读；不采集 terminal.send 输入；多个入口不合并成一条；logger 缺失/磁盘错误不改变结果、异常身份或创建次数。
- SSH 场景：远端参数仅生成摘要；不输出远程环境变量或 provider transcript。

## 部署后现场验收（尚须另行执行）

两端运行新构建并检查 diagnostics-ready 后，在受控本地/SSH/paired 复现中读取两端 trace；旧 daemon 有存活会话时不得为了日志强制重启。此现场验收不是上述单元用例的替代品。
