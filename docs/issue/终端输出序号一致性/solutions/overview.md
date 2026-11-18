# 输出位置归一方案

状态：ready。

## 之前与预期

之前 daemon 快照使用执行 owner 的绝对 outputSequence，runtime 为每个收到的字符累加。断流期间 owner 继续输出，runtime 少收字符；continued 挂接保留旧 runtime 计数，快照却仍用绝对位置。客户端按快照去重，将实际新回显当成旧数据。

预期由 daemon adapter 保存当前已交付流位置。daemon 对存活 Session 同步先 snapshotBarrier/getSnapshot，再 detach/attach；新连接上的输出因此严格位于该边界之后。适配器记录响应前到达的 rawLength、transformed span 与 dataGap，将边界与接收量合成准确 streamPosition。已有连接重挂时保留已交付位置，不把快照上限误当作已交付位置。

每个认证连接对使用新的 clientId，防止旧挂接回调经相同 clientId 向新 socket 投递快照边界之前的数据；同一对控制/流 socket 仍共享同一个 ID。客户端连接层处理原有连接恢复，本 feature 不新增重连、定时读取或轮询。

内部 providerSequence 保持 value 为快照覆盖水位，新增可选 streamPosition 为实际已交付水位。runtime 校准至后者，之后仍按 rawLength 连续累加。没有这个字段的 provider 使用原有逻辑。generation offset 保持 runtime 跨物理进程单调，不把 SSH/paired 主机坐标混用。

## 方案比较

- 取消去重：会重复回放已被快照覆盖的 ANSI/重绘，拒绝。
- 直接 max(snapshot)：跨 socket 仍在排队的数据会再次计数，拒绝。
- 只消费 daemon seq：普通旧 daemon 帧不带 seq，无法覆盖当前存活 daemon，拒绝作为唯一修复。
- 推荐：在现有原子挂接边界重建交付位置；不改客户端 wire、连接策略、业务会话或终端输入语义。

## 兼容与风险

所有文件、PTY、socket 与计数归执行主机；客户端只消费该主机发布的 seq。SSH fixture 的客户端 loopback 地址不代表远端业务服务地址。新 optional 内部字段兼容旧 provider；移动端和旧 client 继续接收既有帧。修复部署在执行主机 runtime；仅更新客户端不会修复旧主机，但新 runtime 能继续使用原有旧 daemon，无需杀掉存活 PTY。

主要风险是响应前输出、同一连接重复挂接、重连后的未知基线、后台丢弃、旧进程 exit 迟到与进程替换。因此必须用真实 daemon socket 回归，另覆盖 reset 与已有排队数据测试。回滚为撤销本 feature 的少量注册接缝，不动用户配置/终端历史；部署不要求杀掉存活 daemon。

## 证据边界

真实 Mini 协议异常与隔离 PTY 断流机制均已证实；原客户端截图当时的去重 baseline 没有直接取得。修复完成不等于已经安装到用户实例。
