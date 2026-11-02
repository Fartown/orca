---
title: '终端对话转聊天退出判定'
slug: '终端对话转聊天退出判定'
status: done
created: 2026-10-23
updated: 2026-11-02
---

# 终端对话转聊天退出判定 开发 Journal

## 1. 关键文档链接

| 类型     | 文档                                                                                     | 状态         | 说明                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| 需求     | [requirements/requirement.md](requirements/requirement.md)                               | ready        | REQ-1～REQ-3                                                                                                |
| 交互     | -                                                                                        | not-required | 无 UI 变更；执行主机核查语义修复                                                                            |
| 调研     | -                                                                                        | not-required | 复现与根因证据在 `.docs/cli-chat-resume-ui-validation/2026-10-23/`（git 忽略），结论摘录于需求 §1 与方案 §1 |
| 方案     | [solutions/overview.md](solutions/overview.md)                                           | approved     | 核查时穿过 macOS login 包装找到 shell                                                                       |
| 测试用例 | [tests/cases/终端对话转聊天退出判定测试.md](tests/cases/终端对话转聊天退出判定测试.md)   | ready        | TC-1～TC-5                                                                                                  |
| 测试记录 | [tests/runs/2026-10-23-本机与SSH真机验证.md](tests/runs/2026-10-23-本机与SSH真机验证.md) | completed    | 本机修复前后对照、SSH 修复前后对照                                                                          |

## 2. 决策点记录

### D-1 在核查处穿过 login 包装，不改 rootProcessId 语义

- 日期：2026-10-23
- 背景：PTY 根进程是 `/usr/bin/login`，写者核查要求根进程是 shell。
- 最终决定：只在 `posixCliWriterShellAlone` 里用 `ptyShellRow` 取 login 唯一的子进程作为 shell，其余规则不变。
- 原因：`rootProcessId` 有多个读者；`confirmShellForegroundProcess` 放过后台任务，弱于这里的要求；关掉 login 包装会破坏 TCC 归属。
- 影响范围：`src/main/runtime/structured-agent-cli-writers.ts` 一个接缝；REQ-1、REQ-2。

#### 备选项

- 核查处穿过 login（采纳）
- provider 改报 shell pid
- 复用 `confirmShellForegroundProcess`
- 关闭 TCC login 包装

#### 关联文档与需求点

- [方案 §2、§4](solutions/overview.md)、[REQ-1/REQ-2](requirements/requirement.md)

### D-2 SSH 与远程主机保持上游行为

- 日期：2026-10-23
- 背景：上游只对本机执行的终端会话提供转聊天；远端 orcad 的终端在 macOS 上同样经过 login。
- 最终决定：不扩展远端支持，只验证修复不改变 SSH 行为。
- 原因：远端转聊天是上游未提供的新能力，需单独设计；本次只修 bug。
- 影响范围：REQ-3、TC-4。

#### 备选项

- 保持上游行为（采纳）
- 同批开放远端转聊天

#### 关联文档与需求点

- [REQ-3](requirements/requirement.md)、[方案 §3](solutions/overview.md)

### D-3 复现误改用户 Codex 配置的处理

- 日期：2026-10-23
- 背景：一轮复现脚本在 Codex 的 hook 审核提示里选了「全部信任」，以为用的是隔离副本，实际写进了真实 `~/.codex/config.toml`。
- 最终决定：用第三方工具 21:22 留下的配置备份和 Codex 的 hook 哈希算法重算出被批准的 5 个 hook，把信任状态还原到误操作前；此后脚本只选「不信任继续」，并断言真实配置修改时间不变。
- 原因：hook 信任决定第三方脚本能否在沙箱外运行，必须由用户本人决定。
- 影响范围：验证脚本与测试记录；产品代码无关。

#### 备选项

- 精确还原（采纳）
- 保留误批准

#### 关联文档与需求点

- [测试记录](tests/runs/2026-10-23-本机与SSH真机验证.md)

### D-4 这是上游缺陷，fork 补丁在上游修复后撤除

- 日期：2026-10-23
- 背景：被修的函数来自上游 #29242，`origin/main` 与 fork 完全一致，上游 macOS 用户默认都会遇到；上游迟早会改这几行，届时与 fork 接缝冲突。
- 最终决定：同样的修复建议提给 stablyai/orca（待用户确认后再提）。上游合入后，按 fork 规则 6 先在 `config/fork-features.jsonc` 删除本功能登记并在此记录，再删除 `src/main/cli-writer-login-shell/` 与接缝改动。
- 原因：上游修掉才是冲突最少的做法；fork 补丁只是在此之前让用户能用。
- 影响范围：功能登记、接缝、本 journal。

#### 备选项

- 只在 fork 修
- fork 先修并提给上游（采纳）

#### 关联文档与需求点

- [方案 §4](solutions/overview.md)

## 3. 开发记录

### 2026-10-23 复现、修复与真机验证

- 本轮目标：查清「终端 Codex 切不到聊天界面、一直报无法确认已退出」并按 fork 流程修复。
- 完成内容：隔离实例在 Movo 复现（开启 login 包装时 Codex 退出后仍被拒绝，关闭包装时可恢复）；新增 `ptyShellRow` 并在上游核查处接入；补回归测试；登记 fork 功能、策略与文档。
- 代码或文档变更：新增 `src/main/cli-writer-login-shell/login-wrapped-pty-shell.ts` 与测试；修改 `src/main/runtime/structured-agent-cli-writers.ts`（接缝 3 行）；`config/fork-features.jsonc`、`config/architecture-policies.jsonc`、`.gitignore`；本目录文档。
- 验证证据：TC-1～TC-5 全部通过，详见[测试记录](tests/runs/2026-10-23-本机与SSH真机验证.md)；`pnpm tc` 通过；反向对照证实测试能抓到该缺陷。
- 未解决问题：Codex 运行中点窗格按钮必然失败、退出后按钮又消失的交互问题未处理（需求 Out of Scope）；`run-terminal-shell-alone.ts` 中相近写法未验证。
- 下一步：提交 PR 合入 `fork/integration`，出包后在正式应用中复验。

### 2026-10-23 独立代码审查

- 本轮目标：请独立审查确认正确性、可复用的上游实现与上游冲突面。
- 完成内容：审查结论为可合，上游改动已是 fork 内最小（1 个文件 3 行）；确认 `confirmShellForegroundProcess` 与 `inspectSpawnFileChildProcessesFromRows` 都不能直接复用；补上「login 包装下 shell 有后台或挂起任务时拒绝」以及窗格入口的断言；方案补充第二个被否决的备选；记录 D-4 撤除条件。
- 代码或文档变更：`login-wrapped-pty-shell.test.ts`；本目录方案与 journal。
- 验证证据：功能 checks 2 个文件 5 用例通过（新增的后台、挂起任务与窗格入口断言均通过）；`check:fork-features`、`check:fork-docs` 通过。
- 未解决问题：向上游提交修复需用户确认；`run-terminal-shell-alone.ts` 同类写法未处理。
- 下一步：用户确认后向 stablyai/orca 提交同样的修复。

### 2026-11-02 随上游同步下线

- 本轮目标：同步上游到 a444233103 时，按 D-4 撤除本 fork 补丁。
- 完成内容：上游重写了 `src/main/runtime/structured-agent-cli-writers.ts`，删掉 `posixCliWriterShellAlone` 的根进程与「shell 独占」核查，改为只有执行主机状态里的写者进程被观测为 `live` 时才拒绝；macOS login 包装导致的误拒不再可能出现，本功能接缝随之消失，`ptyShellRow` 无调用方。合并时该文件整份采用上游；从 `config/fork-features.jsonc` 删除 `cli-writer-login-shell` 登记，从 `config/architecture-policies.jsonc` 删除同名策略及差异预算里的两条路径，再删除 `src/main/cli-writer-login-shell/`。本目录文档保留作历史记录。
- 代码或文档变更：删除 `src/main/cli-writer-login-shell/login-wrapped-pty-shell.ts` 与 `login-wrapped-pty-shell.test.ts`；`config/fork-features.jsonc`、`config/architecture-policies.jsonc`；本 journal。
- 验证证据：合并后的 `structured-agent-cli-writers.ts` 与上游 a444233103 逐字一致（`git diff MERGE_HEAD` 无输出）；仓库内已无对 `login-wrapped-pty-shell` 的引用；`node config/scripts/check-fork-features.mjs` 结果见同步记录 `.docs/upstream-sync-ui-validation/2026-11-02/`。
- 未解决问题：上游新逻辑尚未在 macOS 正式包（PTY 根进程为 login）和 SSH 场景复验；`run-terminal-shell-alone.ts` 同类写法仍未验证。
- 下一步：同步合入并出包后，在正式应用中按 TC-1～TC-4 复验终端 Codex/Claude 退出后转聊天。
