# orca-goal CLI

CLI 驱动已有 Orca 交互会话；方案和行为细节只维护在 [Goal 技术说明](../../docs/issue/Goal目标模式/solutions/Goal目标模式技术说明.md)，需求与验收见 [Goal目标模式 issue](../../docs/issue/Goal目标模式/journal.md)。

## 从仓库运行

在仓库根目录运行；无需先安装全局 Node 或 CLI 包装脚本：

```sh
node goal-mode/cli/orca-goal.mjs --help
node goal-mode/cli/orca-goal.mjs start --objective "完成目标" --check "pnpm test"
node goal-mode/cli/orca-goal.mjs start -f goal.json --detach
node goal-mode/cli/orca-goal.mjs status
node goal-mode/cli/orca-goal.mjs watch --worktree WORKSPACE_PATH
node goal-mode/cli/orca-goal.mjs stop --worktree WORKSPACE_PATH
node goal-mode/cli/orca-goal.mjs resume --worktree WORKSPACE_PATH --detach
node goal-mode/cli/orca-goal.mjs rebind --worktree WORKSPACE_PATH --terminal TERMINAL_HANDLE
node goal-mode/cli/orca-goal.mjs forget --worktree WORKSPACE_PATH
```

`WORKSPACE_PATH` 和 `TERMINAL_HANDLE` 是需替换的占位值；未传终端时由 CLI 交互选择。非交互启动需显式终端和 `--yes`。rebind 要求先停驱动，且新终端在同一工作区。stop 停的是驱动，不证明 agent 进程退出；forget 删除目标 JSON，不承诺清掉所有日志和侧车文件。

配置示例：

```json
{
  "objective": ["完成目标", "满足验收标准"],
  "check": ["pnpm test"],
  "worktree": ".",
  "maxTurns": 20,
  "maxMinutes": 180
}
```

文件支持整行 `//` 注释，命令行优先；相对路径以配置文件目录为基准。默认预算 20 轮、180 分钟，0 表示不限；时长是驱动记账的活跃耗时，不是 token 或费用预算。完整选项以源码 help 和技术说明为准。

## --check 是什么

完成声明触发驱动独立执行的验收命令，工作目录是选定工作区，`CI=1`，无 stdin/TTY。默认首失败短路，`--check-all` 汇总全部；单条默认超时 900 秒。没有 check 时可以完成，但结果标记未经验证。

需要独立模型裁判时，入口是：

```sh
node goal-mode/cli/acceptance-judge.mjs --agent codex --sandbox read-only --criteria-file ACCEPTANCE_FILE --cwd WORKSPACE_PATH
```

模型裁判是可选命令，不能代替可执行行为断言。门禁不可判定、false claim、blocked 与等待用户的规则及已知缺口，以技术说明为准；不把所有失败都归责于干活的 agent。

## 运行文件与测试

状态根目录为 `ORCA_GOAL_HOME` 或用户目录下的 `.orca-goal`。目标按工作区标识，终端可以改挂；放在工作区外不构成文件写入隔离。

[运行提示词](prompts) 在首次使用时按 CLI 的相对路径读取，不能作为普通方案文档移动或删除。App 内的原生目标面板不会把 `orca-goal`、`orca-goal-judge` 安装到 PATH；可一直使用上述 Node 入口。

纯代码测试入口（不启动真实目标）：

```sh
node --test --experimental-test-module-mocks goal-mode/cli/*.test.mjs
```

测试场景与历史事故防线见 [Goal 测试规格](../../docs/issue/Goal目标模式/tests/cases/Goal功能测试.md)。本 README 不维护容易过期的测试总数或通过声明。Windows、SSH、WSL 的未完成边界在技术说明中单列。
