# Goal 插件入口

插件 runtime 在 [resources/plugins/launch/stablyai.orca-goal](../../resources/plugins/launch/stablyai.orca-goal)，已由 bundled-plugins.json 注册。本目录保留测试与验证脚本，不包含可安装的 manifest/worker/panel 三件套。

面板读取 worker 镜像的状态并生成 CLI 命令；目标驱动在 [goal-mode/cli](../cli)。具体命令限制、心跳、快照状态、预算与错误边界统一见 [Goal 技术说明](../../docs/issue/Goal目标模式/solutions/Goal目标模式技术说明.md)。

在仓库根目录执行插件契约测试：

```sh
pnpm exec vitest run --config goal-mode/plugin/vitest.config.ts
```

[verify/panel-check.mjs](verify/panel-check.mjs) 是历史真实浏览器检查脚本，截图目标在 `goal-mode/docs/mockup/`。脚本存在不代表本轮运行过；Orca 渲染验证按 AGENTS.md 的 Electron/Playwright CDP 要求执行。

开发安装若使用 devPluginPaths，应指向 resources 下的实际 runtime 目录。本轮没有安装、启停插件，也没有改动 bundled 内容哈希。
