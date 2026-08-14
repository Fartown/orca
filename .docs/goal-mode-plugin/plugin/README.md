# 目标模式 · Orca 插件

右侧栏面板 + Cmd-J 命令 + 桌面通知。**看门狗循环不在这里** —— 在登录 shell 的
`orca-goal` 进程里(`../impl/`)。原因是宿主对 worker 有三条硬限制:

| 限制 | 值 | 为什么循环放不进来 |
|---|---|---|
| 空闲回收 | 5 分钟 | 等 agent 干活时会被回收 |
| 事件回调 | 5 分钟 SIGKILL | 一轮 agent 工作动辄十几分钟 |
| 命令处理器 | 30 秒 | 一次验收可能跑四十分钟 |

worker 只做三件事:起停 CLI、把状态镜像进 `storage` 给面板读、发通知。
调 CLI 走 `$SHELL -lc` —— worker 的 PATH 来自 GUI 应用,fnm/nvm/asdf 的 shim 不在里面。

## 装

```bash
# 开发态(改完刷新即生效,不用拷贝)
# Orca 设置 → devPluginPaths 加上本目录,并打开插件系统
orca-goal-dev-path=$(pwd)
```

装完要在 Orca 里过一次 consent —— 那个对话框会列出插件申请的能力。

### 改完怎么让它生效(这里踩过坑)

| 改了什么 | 怎么生效 |
|---|---|
| `panel.html` | 刷新面板即可,宿主每次都重读 |
| `worker.mjs` | **必须把插件停用再启用**。`plugins.refresh()` 只重读 manifest,已加载的 worker 模块不会重新 import —— 面板看着变了就以为整体生效了,其实 worker 还是旧的 |
| `orca-plugin.json` 的 capabilities | **会触发重新授权**(consent 指纹变了),哪怕是**减少**能力也一样 |

## 依赖一处 Orca 补丁

面板要显示进度就得读 worker 写的 storage,而 `storage.get` 原本是 `panel: false`。
补丁把它改成 `panel: true`(`src/shared/plugins/plugin-host-api.ts`),`storage.set`
仍然禁止 —— 面板只读不写。没打这个补丁,面板会显示一条红色提示说明原因。

## 测

```bash
npx vitest run --config vitest.config.ts        # 26 条:manifest / 面板 / worker
node ../verify/panel-check.mjs                  # 真机:浅色暗色都量一遍
```

单测覆盖的是**契约**,不是快照:manifest 过仓库真实的 zod schema;面板用到的
设计 token 必须在宿主注入的白名单里、宿主方法必须是面板可调的;worker 的 CLI
超时必须小于宿主的命令超时。这些断言都做过变异验证 —— 把 bug 注回去它们会挂。

`panel-check.mjs` 连 dev 实例的 CDP,切浅色/暗色各量一次:配色是否跟随宿主、
有没有横向溢出、状态区是否渲染出真实数据。面板是 opaque origin,父页面读不到
`contentDocument`,所以走 Playwright 的 frame 执行上下文。

## 写法上照抄了什么

`examples/plugins/hello-orca` 是官方范例,几处关键约定:

- `call()` **永远 resolve**,返回 `{ok, value, errorCode, error}`,调用方查 `ok`
- **静态骨架 + 定点更新**,不整页重建 —— 重建会把用户正在输入的内容冲掉
- token 一律带兜底值 `var(--foreground, #ddd)`
- 面板是 opaque origin,`postMessage` 的 targetOrigin 只能是 `'*'`,宿主改为校验发送方窗口

版式照 `src/renderer/src/components/right-sidebar/checks-panel-content.tsx`:
12px 分区、`border-b` 分隔、11px 次要文字、`bg-accent/20` 信息块、到处 `min-width: 0`。

## 面板今天做不到的事

- **起不了目标**:面板没法拉起后台循环,Cmd-J 命令又不能带参数(没有输入框 API)
- **停不了目标**:同上,只能发通知让你去 CLI

这两条要么等宿主开个「命令带参数」的口子,要么让面板能触发 worker 的长任务。
