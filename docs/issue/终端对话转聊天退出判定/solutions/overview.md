---
title: '终端对话转聊天退出判定 方案'
document_type: solution
status: approved
created: 2026-10-23
updated: 2026-10-23
---

# 终端对话转聊天退出判定 方案

## 1. 根因

macOS 上，Orca 为了让终端里的程序以用户身份获得隐私授权（TCC），通过 `wrapShellSpawnForMacosTccAttribution`（`src/main/providers/macos-tcc-login-shell.ts`）把 shell 包在 `/usr/bin/login -flpq 用户 /bin/bash … exec -l -- shell` 里启动。`login` 不会被替换，它留作 PTY 的根进程，shell 是它唯一的子进程：

```mermaid
flowchart LR
  A["PTY 根进程：/usr/bin/login（Ss）"] --> B["-/bin/zsh -l（S+）"]
  B --> C["codex（S+）"]
```

终端写者核查 `posixCliWriterShellAlone(rootPid)`（`src/main/runtime/structured-agent-cli-writers.ts`）拿的是 PTY 的根进程号（provider 报告的 `rootProcessId`，即 `login`），要求它本身是 shell、在前台、下面没有任务。`login` 不是 shell，所以永远判定「终端里还有程序」，`assertCliConversationWritersExited` 永远拒绝，提示 `conversationHeldElsewhere`。

## 2. 修法

在功能目录新增 `src/main/cli-writer-login-shell/login-wrapped-pty-shell.ts`：`ptyShellRow(index, rootPid)` 返回 PTY 实际运行的 shell 行：根进程不是 `/usr/bin/login` 时就是根进程本身；是 `login` 时取它**唯一**的子进程，有零个或多个子进程则返回空（判定不通过）。

上游接缝只改 `posixCliWriterShellAlone` 三行：用 `ptyShellRow` 取 shell 行，后续「是 shell、在前台、下面没有非会话首进程的任务」三条检查原样作用在这个 shell 上。

## 3. 各项在哪台机器上

- 核查在运行该终端的机器（执行主机）上执行，读的是这台机器的进程表；本机终端就是本机。
- 不新增文件、端口、环境变量、配置或服务；不改客户端与主机之间的 RPC 或推送内容。
- SSH 工作区由远端 orcad 执行终端。远端是 macOS 时，orcad 起的终端同样经过 `login`（隔离 SSH 实测，远端终端里 `$HOME` 被 login 恢复成账户主目录）。但客户端只对本机执行的终端会话提供转聊天（`resolveCliChatResumeSource` 要求执行主机为本机；`ai-vault-session-resume-in-chat.ts` 对非本机会话判 `remote`），远端核查不会被触发，行为不变。
- 新旧版本混用：修复只在执行主机侧生效；旧版本主机继续拒绝，不影响协议兼容。

## 4. 备选方案

| 方案                                                                                                             | 结论   | 原因                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 核查时穿过 `login` 找到 shell（采纳）                                                                            | 采纳   | 改动最小，只影响这一处核查，其他读 `rootProcessId` 的地方语义不变                                                                                             |
| 让 provider 把 `rootProcessId` 报成 shell                                                                        | 不采纳 | `rootProcessId` 有多个读者（Codex 共享服务、tmux 识别、前台进程解析等），改语义影响面大                                                                       |
| 复用 `confirmShellForegroundProcess`（按 shell 名在树里找）                                                      | 不采纳 | 它只要求 shell 在前台，放过后台运行的任务，弱于这里「一个任务都不能剩」的要求                                                                                 |
| 复用 `inspectSpawnFileChildProcessesFromRows`（`spawn-file-child-processes.ts`，已把 login 与 shell 视作启动链） | 不采纳 | 需要 shell 名（`listProcesses` 不提供）；不排除会话首进程，会把 zsh 提示符的 zpty worker 当成任务而拒绝，与上游写者核查的规则不符；要复用就得再改这个上游文件 |
| 关掉 TCC login 包装                                                                                              | 不采纳 | 会破坏 macOS 隐私授权归属                                                                                                                                     |

`/usr/bin/login` 路径常量在功能文件内定义，而不是导出 `macos-tcc-login-shell.ts` 里的常量：后者要再改一个上游文件、多一个接缝。

## 5. 风险

- login 包装改成多级启动链时，`ptyShellRow` 会因找不到唯一子进程而拒绝，回到修复前的「拒绝」行为，不会误放行。
- shell 启动早期 `login` 的子进程还是 bash 跳板（尚未 exec 成目标 shell），这时如果被核查，bash 也是 shell，没有子任务时会放行；这时终端里还没有 agent，放行不会造成并发写。
