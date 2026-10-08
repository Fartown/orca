# 终端 ID 复制主机路由

### REQ-901 按所属主机查询

当前状态：已实现

本地和直接 SSH 终端使用本机 runtime；配对 runtime（包括其代理的 SSH）使用所属环境。git worktree 与 folder workspace 均覆盖。

### REQ-902 失败不串主机

当前状态：已实现

归属不明、主机失联、RPC 失败不查询其他主机、不覆盖剪贴板；写入失败沿用原错误提示。

### REQ-903 保留客户端剪贴板和协议兼容

当前状态：已实现

查询复用 terminal.resolvePane 与现有复制实现，写入始终由客户端 clipboard API 完成，不新增 RPC 或远端依赖。
