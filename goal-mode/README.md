# Goal 目标模式

为已有 Orca 交互式 agent 会话提供持久目标、轮次驱动、可选独立验收与预算。完整需求、实现、限制和测试已统一到 [Goal issue](../docs/issue/Goal目标模式/journal.md)。

| 入口                                                                               | 用途                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------ |
| [CLI 用法](cli/README.md)                                                          | 从仓库运行命令、配置与测试入口       |
| [目标管理方案](../docs/issue/Goal目标模式/solutions/Goal目标管理与交互闭环方案.md) | 原生面板、宿主服务与驱动的实施主入口 |
| [Goal 需求](../docs/issue/Goal目标模式/requirements/Goal目标模式.md)               | 目标、交付分级与未完成项             |
| [Goal 技术说明](../docs/issue/Goal目标模式/solutions/Goal目标模式技术说明.md)      | 唯一技术正文                         |

CLI 源码仍在 `goal-mode/cli/`；App 内的目标面板由 `src/main/goals/` 与 `src/renderer/src/components/goals/` 原生提供，驱动是 `config/scripts/build-goal-driver.mjs` 打出的单文件 `goal-driver.js`。旧的内置插件 `stablyai.orca-goal` 已移除，首次启动时引导安装到用户数据目录的副本会被自动退役。原生面板不会把 `orca-goal`、`orca-goal-judge` 安装到 PATH。

`cli/prompts/*.md` 是运行文件，必须原地保留。历史设计图和截图仍在 `docs/mockup/`，不能据此认定本次 UI 验收通过。
