# Goal 目标模式

为已有 Orca 交互式 agent 会话提供持久目标、轮次驱动、可选独立验收与预算。完整需求、实现、限制和测试已统一到 [Goal issue](../docs/issue/Goal目标模式/journal.md)。

| 入口 | 用途 |
| --- | --- |
| [CLI 用法](cli/README.md) | 从仓库运行命令、配置与测试入口 |
| [插件位置](plugin/README.md) | bundled runtime、面板和测试 |
| [Goal 需求](../docs/issue/Goal目标模式/requirements/Goal目标模式.md) | 目标、交付分级与未完成项 |
| [Goal 技术说明](../docs/issue/Goal目标模式/solutions/Goal目标模式技术说明.md) | 唯一技术正文 |

CLI 源码仍在 `goal-mode/cli/`；插件 runtime 已移入 [resources/plugins/launch/stablyai.orca-goal](../resources/plugins/launch/stablyai.orca-goal)，并注册在 bundled-plugins.json。插件已内置不等于 CLI 包装命令已安装到 PATH。

`cli/prompts/*.md` 是运行文件，必须原地保留。历史设计图和截图仍在 `docs/mockup/`，不能据此认定本次 UI 验收通过。
