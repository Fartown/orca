# 数字终端身份恢复现场与补修

状态：implementing。范围仍为手机工作区终端身份恢复。

## 现场

Mac mini `1.4.214-preview.76`，构建提交 `fa88bf26ce5eb03f7d091b131a5c4cac754b8b64`，包含上轮修复。2026-11-09 19:33:00 激活 `acp-workspace` 时，renderer 为 live PTY `4/5` 创建新 tab，provider 分别返回新 PTY `14/15`，`isReattach=false`，未携带 agent 命令。更早同类事件生成 `6–13`。这证明存在实际空 shell 创建，不能归因于未升级或单纯手机缓存。

现场 renderer 只有四个原 tab，执行主机有六个 live 终端；`4/5` 是另两个仍运行的 Claude 会话，主机有其原 tab/leaf/incarnation。其他工作区的 renderer 缓存仍持有裸数字 `4/5`。跨工作区的 `competingBinding` 阻止原身份恢复，进入新 tab fallback；本地 provider 为避免重启后的数字 ID 碰撞，普通 spawn 明确忽略数字 sessionId，于是新建空 shell。

## 修复边界

- 只有执行主机的新鲜、完整、工作区限定 census 才授权此恢复。跨工作区旧裸 ID 不否决本工作区的主机记录；本工作区冲突及归属未知的 mounted 记录继续阻止精确绑定。
- 数字 PTY 若不能恢复原 tab/leaf，则 decline，继续等待身份可验证，不 mint 新 tab。普通非数字 fallback 不变。
- 不放宽 local provider 的数字 ID 防碰撞规则，不改 wire 字段、opcode 或手机协议。
- 本机状态、缓存与 `127.0.0.1` RPC 属于客户端；PTY、进程活性、原 pane 记录由执行主机负责。SSH 场景由远端 census 提供权威，断连仅为 `unverifiable`，不读失联主机、不推断退出。
- 覆盖 git worktree 和 folder workspace；不得按 Terminal 名称删除标签或终止现有进程。

## 验证计划与边界

先用现场形态 `4/5 + 其他工作区旧 mounted 绑定` 运行失败回归，再验证原 tab/leaf 恢复、多次激活不增加 tab、数字身份缺失和冲突不新建、稳定非数字 fallback 不回退。本机与 SSH 隔离真机均需验证；正式 Mac 安装及手机实际使用验收另列，不因测试通过标完成。

证据目录：`.docs/mobile-terminal-recovery-ui-validation/2026-11-09/`。生产只做读取及短暂开启后关闭的诊断 inspector，没有重启、关闭 tab 或发送终端输入。
