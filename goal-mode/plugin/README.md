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

面板执行不了任何目标操作:没有 panel→worker 的通道,Cmd-J 命令也不能带参数。
所以它改为**把命令拼好给你**——表单填完点「生成启动命令」,操作按钮点了直接显示对应
命令,都在面板里可选中复制。

`terminal.sendText` 确实是面板可调的,但 `workspace.readContext` 只返回终端 id、
没有标题,面板只能盲选一个窗格——正是宿主注释里警告的「把延迟写入送进别的窗格」。
CLI 自己的终端选择器信息比面板全,所以选终端这件事留给它。

要让按钮真能执行,需要宿主开一个「命令带参数」的口子,或者让面板能触发 worker 的长任务。

## 宿主的硬限制(都实测过)

- `storage` 单值 256 KiB,超了 `storage.set` **抛异常**(不是返回 `ok:false`),
  整份写不进去。镜像自己按 200 KiB 裁剪,且只有写成功才更新去重缓存。
- worker 空闲 5 分钟被回收,而面板**没有任何叫醒它的办法**(能调的只有
  `storage.get` / `workspace.readContext` / `terminal.sendText` / `notifications.show`)。
  所以有目标在跑时每 60 秒心跳写一次,`updatedAt` 才代表「worker 还活着」;
  面板据此在丢三次心跳后提示数据是快照。
- 宿主的 `respond()` 在面板会话被替换时**故意不回消息**,所以面板侧的调用必须自带超时,
  否则 Promise 永久悬着、pending 每 4 秒漏一条,界面还一声不吭。
- 面板不用管 ping/pong:宿主注入的 srcdoc prelude 自己回(`plugin-panel-shell.ts`)。
- `notifications.show` 返回 `{ delivered }`——系统静音时是 `false`。别把它当成唯一反馈。
