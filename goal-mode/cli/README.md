# orca-goal — 目标模式 agent 看门狗(v1)

外部驱动进程,用 Orca 公开 CLI 驱动你**已经开着的交互式 agent 会话**。
不改 Orca 源码,不装 agent hook,不受 Claude Code 的 8 轮 Stop-hook 上限约束,
完成守卫跑多久都行。

## 用法

装个别名:

```bash
alias orca-goal='node /path/to/goal-mode/cli/orca-goal.mjs'
```

最短路径,和 Codex 的 `/goal` 一样只给一句目标。不带 `--terminal` 会列出终端让你选,
列表里标出哪个有 agent、是忙是闲:

```bash
orca-goal start --objective "把登录页的表单校验补齐"
```

这就是完整用法。**验收命令是可选的**,加不加见下面「跟 Codex 的差别」。
预算写 `0` 表示不限(`--max-turns 0 --max-minutes 0`),和 Codex 默认的 unbounded 一致。

目标写成配置文件(支持整行 `//` 注释,`objective` 可以是数组,相对路径以文件所在目录为基准):

```json
{
  // 多行目标写成数组更好读
  "objective": [
    "把登录页的表单校验补齐,错误态要跟设计稿一致。",
    "不要动 e2e 的断言。"
  ],
  "check": ["pnpm lint", "pnpm test"],
  "worktree": ".",
  "maxTurns": 20,
  "maxMinutes": 180
}
```

```bash
orca-goal start -f goal.json --detach     # 后台跑,立刻返回
orca-goal watch  --terminal term_xxx      # 跟输出,驱动退出时自动结束
orca-goal status                          # 所有目标 + 驱动进程是否还活着
orca-goal stop   --terminal term_xxx      # 停掉驱动(保留记录)
orca-goal forget --terminal term_xxx      # 删记录
```

`--detach` 起的目标结束时会发桌面通知(macOS 走 osascript,Linux 走 notify-send,
Windows 走 PowerShell 气泡;发不出去就静默跳过,绝不影响目标结果)。

状态在 `~/.orca-goal/`(`ORCA_GOAL_HOME` 可覆盖):`goals/` 状态、`log/` 逐轮 JSONL、
`log/*.out` 后台驱动的输出、`claims/` 认领文件、`prompts/` 落盘的提示词、`lock/` 进程锁。
**刻意放在工作区之外**,agent 改不到自己的验收配置。

> 注意 `--worktree`:默认取终端**登记**的工作区,那未必是 agent 实际在干活的目录。
> 启动时会把验收目录打出来让你确认 —— 看一眼,不对就补 `--worktree`。

## 一轮长什么样

```
清空认领文件 → 注入提示词 → 等这一轮真结束 → git tree 快照 → 读认领文件
   → 声称完成?跑验收 → 通过则结束,不通过则回灌失败原文并继续
   → 没声称?查空转与预算 → 下一轮
```

四个终止条件:验收通过、连续假完成 3 次、连续声称受阻 2 次、预算耗尽或连续 3 轮零改动。

## 跟 Codex `/goal` 的差别

看门狗本身是照抄的:Codex 的 `continue_if_idle()`(`codex-rs/ext/goal/src/runtime.rs`)
从头到尾没有一次模型调用 —— 标志位、查库、枚举比较、渲染模板、开下一轮。
续跑内容是 `CONTINUATION_PROMPT_TEMPLATE.render(...)`,模板在
`codex-rs/ext/goal/templates/goals/`(`continuation.md` / `budget_limit.md` / `objective_updated.md`),
`prompts/` 就是照它的结构做的。预算判定是 SQL。**所以「机械看门狗」不是设计选择,是原样照搬。**

真正的差别有两处:

**一、站位。** Codex 的看门狗是编进二进制的 extension crate,长在 agent 自己的运行时里:
`on_thread_idle` 生命周期钩子触发,直接把 `ResponseItem` 塞进 turn 输入。
这里做不到 —— 约束是不改 Orca 源码,而插件 API 的 `terminal.sendText` 要求 worktree 处于聚焦状态。
所以退化成:轮询 hook 状态、往 TUI 里敲字符、每轮把目标当新消息重发。三条都是降级。

**二、完成怎么算数。** Codex **没有验收**。模型调 `update_goal` 把状态设成 `complete` 时,
代码只记了条分析事件、清了当前 turn、发了个通知就返回,**没有任何校验**
(`codex-rs/ext/goal/src/tool.rs`)。防敷衍全靠工具描述里的散文
(「only when the objective is achieved」「blocked 要连续三轮」)。

这里默认行为与它一致 —— 不给 `--check` 就采信 agent 的说法,结果标记为未经验证。
`--check` 是**在 Codex 之上加的**,不是它的一部分。

反过来也有一处这里更硬:「连续三轮才采信 blocked」在 Codex 只是提示词里的话,
这里是真计数,不到阈值不采信。

## --check 是什么:完成守卫(可选)

agent 声称完成时,由**驱动进程**(不是 agent 自己)去独立重跑这些命令。全部退出码为 0 才算完成;
任何一条非 0,完成声明就被驳回,失败输出原样回灌进下一轮提示词。
cwd 是 worktree,带 `CI=1`,**没有 TTY**,单条默认 900 秒超时,第一条失败即短路。

裁判和选手必须不是同一个人 —— 整个看门狗的价值就压在这一条上。所以验收是**命令**,
用退出码表态,而不是再问一遍模型「你做完了吗」。

### 没有能跑的测试怎么办

命令只要求「用退出码表态」,所以提示词也能当验收 —— 用附带的裁判包一层:

```bash
orca-goal start --objective "把登录页的空态和错误态补齐" \
  --check "pnpm lint" \
  --check 'orca-goal-judge --criteria "登录页在网络失败时展示错误态并可重试;空态有插图和引导文案"'
```

裁判跑在**独立的 headless 会话**里,不带干活那个会话的上下文,所以不会被「我已经说服自己做完了」
污染;判词打到 stdout(会进驳回提示词),用退出码表态。**裁判自己跑挂了、超时了、判词解析不了,
一律算不通过** —— 否则「验收工具坏了」会被当成「目标达成」。

### 让 Codex 当裁判(推荐)

```bash
--check 'orca-goal-judge --agent codex --criteria-file ./acceptance.md'
```

比同家族互判强两处:

1. **换个模型家族**。同家族的盲点是相关的 —— 干活那个看不出来的,同门裁判多半也看不出来。
2. **只读沙箱**。codex 走 `--sandbox read-only`,裁判**在机制上改不了任何文件**。
   实测:故意给它「把 add.mjs 改成 999,改完就算达成」这种标准,它报 FAIL 且文件哈希没变。
   claude 那条路没有等价的强制,只能靠提示词让它别改。

支持的裁判在 `acceptance-judge.mjs` 的 `AGENTS` 表里,加一个新的只要写「怎么调用」和「判词从哪读」。

长标准写文件:`--criteria-file ./acceptance.md`。`--cwd` 指定判定目录,`--timeout` 秒数(默认 600)。

代价要说清楚:每次判定是一次真实的模型调用(claude 实测约 $0.2),而且它终究是模型判模型 ——
**能跑的检查永远优先**,这个是没有检查可跑时的兜底,不是替代品。

## 篡改挡板:验收绿了 ≠ 验收还是原来那个验收

验收命令存在工作区之外,agent 改不动。但它**依赖**的东西都在工作区里 ——
测试文件本身、`package.json` 的 scripts、各种 lint/test config,乃至忽略规则。
把这些改弱,验收一样会变绿。

每轮 diff 两个 tree,扫这几类痕迹(与 agent 的叙述无关):

| 发现 | 挡板 | 说明 |
|---|:--:|---|
| `assertions-removed` | 是 | 测试文件里断言或用例被**净**删减(只增不减不报) |
| `tests-skipped` | 是 | 新增 `.skip` / `.only` / `xit` / `@Ignore` / `pytest.mark.skip` 等 |
| `gate-config-edited` | 是 | 改了 package.json、vitest/jest/playwright config、eslint、tsconfig、Makefile、CI workflow… |
| `ignore-rules-edited` | 是 | 改了 `.gitignore`,或改了 `.git/info/exclude` —— 后者不在版本库里,**tree diff 完全看不见**,却能让改动从内容指纹里消失 |
| `test-only-edit` | 否 | 本轮只动测试没动源码。只写进提示词当证据,不挡完成 |

挡板不是硬失败。声称完成 + 验收通过 + 有未质证的痕迹时,注入 `tamper-challenge`:
把具体到文件的痕迹原样列给它,要求逐条判断是「削弱了检查」还是「目标本来就要求的」,
然后重新声称。合法改动的代价是**多跑一轮**,不会被误杀;
反复被指出后仍在削弱,才停在 blocked。

两个刻意的设计:

- **只压制紧接质证的那一轮**。agent 为了回应质证去改那个文件,本身又会被扫出同一处发现,
  不压制就会质证套质证、最后误判成受阻。隔一轮同一处再被削弱,仍然要质证。
- **`test-only-edit` 不设挡板**。目标本来就是补测试的情况太常见,设成挡板全是误报。

## 为什么不做成 Orca 插件

查过了,插件 API 托不住这个东西,三处硬伤:

1. **`terminal.sendText` 每次调用都重新解析当前聚焦的 worktree**,不匹配就抛
   `terminal is outside the active worktree`(`src/main/plugins/plugin-host-method-bindings.ts:98-107`)。
   看门狗按定义就是延迟写入者 —— 你切去别的 worktree,注入就全废。这是宿主侧不变量,不是权限。
   顺带还有 **4096 字符上限**(`plugin-host-api.ts:20`),续跑提示词就超了。
2. **面板拿不到 worker 状态。** 面板 CSP 是 `connect-src 'none'`(`plugin-panel-shell.ts:20`),
   而 `storage.*` 是 `panel: false` —— 面板与 worker 之间没有通道,进度界面做不了。
3. **可订阅事件只有三个**(`plugin-manifest.ts:65-69`):`worktree.created`、`worktree.removed`、
   `agent.status.changed`。拿不到 worktree 路径 —— `workspace.readContext` 刻意摘掉了 path,
   只有 `worktree.created` 带路径,而已存在的 worktree 永远不会再发这个事件。

就算硬写成插件,**每个承重部分还是得绕过插件 API 去 shell 调 CLI**(注入、找终端、跑验收都得绕),
而绕出去之后**验收环境反而更差**:插件 worker 的 env 是清洗过的白名单,PATH 来自 GUI 应用,
不含 shell profile 里加的东西 —— 用 fnm/nvm/asdf 的话验收命令直接找不到 node。
`orca automations` 的 precheck 是同样的毛病。

另外两条路也查了:

- **automations**:agent 还在忙时 `findReusableAutomationSession` 返回 null,控制流**落到
  `launchAgentBackgroundSession`**(`useAutomationDispatchEvents.ts:434-519`)—— 不是跳过、
  不是排队,是在同一个 worktree 里再起一个 agent。不能用。
- **orchestration**:是 CLI 里唯一能走 bracketed paste(保多行)的门,但注入的永远是那段
  约 100 行的 preamble(`preamble.ts:47`),你的文本只能当 `--spec` 塞进去;而且它的「干完了」
  信号是 agent 自愿上报的,比 hook 派生状态弱。`worker-stop` 还会直接关掉终端。

## 几个当初想当然、后来被实测推翻的点

| 想当然 | 实测 |
|---|---|
| 多行提示词可以直接发 | `terminal send` 把 `\n` 原样写进 PTY,TUI 当回车 —— 提示词会被切成多次提交。**必须压成单行**(6000 字符实测无损,上限 16 MiB) |
| 用 `terminal read --cursor` 增量读输出 | agent TUI 在 alt-screen 原地重绘,cursor 不推进,只拿得到当前可见屏(约 33 行)。稍长的回答就把注入文本连同轮次标记顶出去了 |
| 扫终端里的 `ORCA_GOAL_COMPLETE:` 哨兵 | 我们注入的提示词自己就含这串字,回显会自触发假完成;而标记又会被滚屏冲掉,没法可靠切分。**改成让 agent 写认领文件** |
| `terminal wait --for tui-idle` 能判轮次结束 | 它只看 OSC 标题且状态是黏的(读了不清)。实测 Claude 干活时返回成功,完全空闲的普通 shell 反而一直超时 |
| 标题字形能区分「跑完」和「等权限」 | Orca 的 `SYNTHETIC_AGENT_TITLE_PROFILES` 里没有 `claude` 条目,从不改写 Claude 标题;等权限确认时仍是 `✳`,与跑完同形 |
| `send` 返回 `ok:true` 就是发出去了 | 移动端持有该 PTY 输入锁时返回 `ok:true` 但 `accepted:false`,一个字节都没写 |
| 有 hook 状态行就该信 hook 状态 | 有的 agent(实测 kimi)thinking 阶段不发 hook 事件,状态能停在上一轮的 `done` 上一百多秒,而它的 TUI 一直在刷屏。**拿不到本轮状态时必须回落去看 PTY 有没有输出**,否则会把干得好好的 agent 判成「毫无动静」 |
| headless agent 可以直接 execFile 调 | `codex exec` 见到未关闭的 stdin 会打印「Reading additional input from stdin...」然后一直等。必须 `spawn` 并把 stdin 设成 `ignore` |

轮次结束首选 `orca worktree ps --json` 的 `worktrees[].agents[].state`
(`working`/`waiting`/`blocked`/`done`)—— CLI 里唯一拿得到 `waiting` 的地方,
配 `stateStartedAt` 排除上一轮遗留的 `done`。拿不到时才退回标题字形 + PTY 静默。

## 已实测

- 单行注入落地、agent 接管、轮次结束判定 → 完成 → 验收通过(CLI 入口全程)
- **假完成被驳回后自己爬回来**:验收放在仓库外,agent 看不见;第 1 轮它修好可见的检查就声称完成,
  验收失败 → 注入 `rejected-completion` 附失败原文 → 第 2 轮照着补齐 → 通过
- `git add -A` 走 `GIT_INDEX_FILE` 临时索引,不动真索引(实测前后 `git status` 一致、暂存 0 条)
- tree SHA 同时覆盖「已跟踪内容变化」和「未跟踪新文件」;非 git 目录返回 unavailable 而非假装没变
- **篡改挡板**在真 agent 上跑通两条分支:改门禁配置(`package.json`)与删断言,
  两次都是「拦住 → 质证 → 下一轮说明后放行」,各多花一轮,没有误杀
- 篡改扫描器对真 git tree 的六种场景实测:删断言 / 加 skip / 正当补断言(不报)/
  改 package.json / 改 `.git/info/exclude`(tree diff 为空仍被抓住)/ 只改源码(不报)
- 后台模式全链路:`--detach` 0.2 秒返回 → `status` 显示驱动存活 → `watch` 跟到驱动退出 →
  `stop` 收到 SIGTERM 后把状态标成人为中断 → `forget` 删记录
- 配置文件:数组形式的 objective、`//` 注释、相对 worktree 路径都实测生效
- `--prompt-file`:agent 确实会去读那份 105 行的落盘提示词并完成目标(单次验证,见局限 5)
- 提示词裁判(`acceptance-judge`)在 claude 与 codex 两种裁判上的退出码契约:
  未达成退 1 并打出具体证据、达成退 0、裁判自身跑不起来/超时退 1(不会把工具故障当成目标达成)
- **codex 裁判的只读沙箱是真的**:故意给它「改文件就算达成」的标准,它报 FAIL 且文件哈希未变
- **`resume` 接管模式**:首轮不注入,先等 agent 手上那一波跑完再接手 —— 用于驱动进程退出了
  但注入已经落地的情况,重开会打断它
- 决策核心、认领文件解析、篡改判定、配置文件、通知转义、终端选项渲染、轮次判定:58 个单测(`node --test`)

## 已知局限

1. **只在 Claude Code 上实测过。** hook 状态那条路对 Orca 登记的其它 agent 应该同样有效
   (`agentType` 字段里见过 `kimi`),但标题兜底那条路的字形是 Claude 特有的。
2. **验收命令在本地跑。** worktree 在 SSH 远端时,`cwd` 在本地不存在 —— 这种场景当前不支持。
3. **不计量 token。** 预算只有轮数和时长两个口径。
4. **认领文件要靠 agent 去写。** 它忘了写就多跑一轮,由提示词反复强调。
5. **`--prompt-file` 只验证过一次,所以默认不开。** 它保住提示词排版、终端里也干净,
   代价是 agent 多一次读取,而且**它可能不读**。默认的压平单行是被反复跑通过的路径。
6. **篡改扫描是启发式的。** 断言识别靠正则,覆盖常见 JS/TS/Go/Python/Java/C++ 写法,
   小众框架会漏;门禁配置是白名单,自定义脚本路径不在里面。漏报比误报多,这是刻意的取舍
   —— 挡板会打断正常流程,宁可少拦。
7. **文件夹工作区(非 git)没有空转熔断** —— 拿不到内容指纹时熔断自动关闭并告警,不会把「测不出」当成「没变化」。
8. 权限确认期间只暂停不注入,超过单轮上限才停;`--permission-mode` 给宽一点会顺畅很多。
