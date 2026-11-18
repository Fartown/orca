# 终端输出序号一致性

状态：ready。来源：[Fartown/orca#146](https://github.com/Fartown/orca/issues/146)。

## 背景与范围

Mini 的存活终端收到输入并回显，本机镜像没有显示。已捕获相同 PTY/incarnation 的快照 seq 大于随后新回显 seq；真实隔离 PTY 经 daemon socket 断流重挂复现同一缺陷。原 renderer baseline 未取得，历史截图当次归因保留此边界。

### REQ-001 快照与实时流位置一致

- 当前状态：已实现。
- continued 重挂后实时流必须继续执行端位置，短输入无需追赶漏收差额；恢复快照仍能去除真正的重复帧。

### REQ-002 双 socket 竞态

- 当前状态：已实现。
- 控制响应早于/晚于排队输出都不能双计；快照覆盖位置与适配器已交付位置分别记录。新物理进程与同一存活进程的继续挂接分别处理。

### REQ-003 主机与版本兼容

- 当前状态：已实现。
- 本地、SSH、paired runtime、folder workspace、git worktree 与移动端订阅共享执行主机位置；旧 daemon 没有普通帧绝对 seq 仍可恢复。
- 不增加 stream opcode，不增加协议最低版本，不由 feature 自行重连/轮询；失联状态保持 unverifiable，不视为 exited。

### REQ-004 现场保护与证据

- 当前状态：已实现。
- 不重启、关闭或重放业务终端；真实 App 使用独立 profile、背景 hidden renderer，SSH fixture 自行搭建。
- 客户端机器拥有测试 App/profile/CDP 与 loopback sshd 127.0.0.1:2222；执行主机拥有 PTY、daemon/socket、workspace 与 stdin/输出。测试环境变量与文件只影响隔离实例。

## 验收

测试对应 [恢复与去重](../tests/cases/恢复与去重.md)。不以 mock 单测、新建观察连接或旧会话 PID 存活代替镜像端可见回显证据。

## 已实现证据

REQ-001～004 对应 [TC-001～005](../tests/cases/恢复与去重.md) 与 [本地及 SSH 实测](../tests/runs/2026-11-18-本地与SSH.md)。旧版和修复版使用同一客户端、同一真实断流与丢帧过程；没有手工设置恢复水位。
