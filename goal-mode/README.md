# Goal 模式:agent 看门狗

给 agent 设一个持久目标,它一轮一轮跑下去,直到达成、受阻、或预算用尽。
参照 Codex 的 `/goal` 做的,但守卫和验收都比它硬:完成声明要过验收裁判,还会扫描削弱验收的痕迹。

## 目录

| 目录 | 是什么 |
|---|---|
| [`cli/`](./cli) | `orca-goal` 驱动进程。看门狗循环、取证、验收闸门、篡改扫描都在这里,常驻在 `~/.orca-goal` 下工作 |
| [`plugin/`](./plugin) | Orca 插件。右侧面板显示进度与逐轮时间线;它**不执行**目标操作,只把命令拼好交给你 —— 原因见插件的 README |
| [`docs/`](./docs) | 方案演进、Codex Goal 模式考古、提示词、界面稿 |

## 为什么是仓库顶层的一个目录

这是个 fork,越少碰上游的路径越好。内置插件本该放 `resources/plugins/launch/`,
但那里有一份 `bundled-plugins.json` 索引是上游每加减插件都要动的共享文件 —— 放进去等于给自己
埋一个长期冲突点。而 `cli/` 根本不是插件,那条路也安置不了它。

顶层新目录上游永远不会创建,冲突风险为零,而且 CLI 和插件本来就是一个产品:
面板里给你的每一条命令,跑的都是 `cli/` 里那个驱动。

哪天要随 fork 分发给别人,把 `plugin/` 挪进 `resources/plugins/launch/` 并接受索引冲突即可,
那时也只是一次目录移动。

## 装

```sh
# CLI:~/.local/bin 下两个包装脚本,指向 cli/ 里的实现
ls ~/.local/bin/orca-goal ~/.local/bin/orca-goal-judge

# 插件:拷进 Orca 的插件目录(改完 worker 要 setEnabled false→true 才生效,见 plugin/README.md)
cp plugin/{orca-plugin.json,panel.html,worker.mjs} \
   ~/Library/Application\ Support/orca/plugins/orca-goal.goal/
```

## 测

```sh
cd cli    && node --test --experimental-test-module-mocks *.test.mjs  # 驱动:72 个
cd plugin && npx vitest run --config vitest.config.ts               # 插件:71 个
```

## 对 Orca 源码的改动

只有两处,都在半年只动过一两次的文件里,冲突面很小:

- `src/shared/plugins/plugin-host-api.ts` —— `storage.get` 的 `panel` 从 `false` 改成 `true`。
  面板没有别的办法读到自己 worker 算出来的状态(不存在 panel↔worker 通道)。
- `src/main/plugins/plugin-host-conformance.test.ts` —— 跟着补的正反两向用例。
