// 目标模式插件的 worker,在独立进程里跑(纯 Node,没有 Electron),首次触发时才 fork。
// 契约见 src/main/plugins/plugin-host-runtime.ts 的 PluginWorkerOrcaApi。
//
// 刻意不把看门狗循环写在这里。宿主对 worker 有三条硬限制:空闲 5 分钟回收、
// 事件回调超 5 分钟 SIGKILL、命令处理器 30 秒超时。而一轮 agent 工作动辄十几分钟、
// 一次验收可能跑四十分钟 —— 循环放进来必然被砍。执行体是登录 shell 里的 orca-goal 进程,
// 这里只做三件事:起停它、把状态镜像进 storage 给面板读、发通知。
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const GOAL_HOME = process.env.ORCA_GOAL_HOME || path.join(os.homedir(), '.orca-goal')
const MIRROR_KEY = 'goals' // 面板读这个 key
const ACTIVE_POLL_MS = 5_000 // 有目标在跑时的刷新节奏
const CLI_TIMEOUT_MS = 20_000 // 必须明显小于命令处理器的 30 秒上限
const ROUND_TAIL = 20 // 时间线只要最近这些轮

let api = null
let pollTimer = null
let lastMirrored = ''

export default async function activate(orca) {
  api = orca
  orca.log(`目标模式已激活,授予的能力:${orca.grantedCapabilities.join(', ')}`)

  orca.commands.register('goal.status', async () => {
    const goals = await readGoals()
    const active = goals.filter((g) => g.state === 'active')
    const text = active.length
      ? `进行中 · 第 ${active[0].turns} 轮 · ${active[0].worktreePath}`
      : goals.length
        ? `没有进行中的目标(共 ${goals.length} 条记录)`
        : '还没有设过目标'
    await notify(text)
    await mirror()
    return { active: active.length, total: goals.length, text }
  })

  // 命令拿不到 worktree 上下文(invokeCommand 只传 pluginKey 和 commandId),
  // 所以有多个目标在跑时不敢猜停哪个 —— 宁可让用户去 CLI 里点名。
  orca.commands.register('goal.stop', async () => {
    const active = (await readGoals()).filter((g) => g.state === 'active')
    if (active.length === 0) {
      await notify('没有进行中的目标')
      return { stopped: 0 }
    }
    if (active.length > 1) {
      await notify(
        `有 ${active.length} 个目标在跑,命令分不清停哪个 —— 请用 orca-goal stop --terminal`
      )
      return { stopped: 0, ambiguous: active.length }
    }
    const result = await runCli(['stop', '--terminal', active[0].terminalHandle])
    await notify(result.ok ? '已停止' : `停止失败:${result.output.slice(-160)}`)
    await mirror()
    return { stopped: result.ok ? 1 : 0 }
  })

  // 命令不能带参数,也没有「弹输入框」的宿主 API,所以只能把人引到面板。
  orca.commands.register('goal.start', async () => {
    await notify('在右侧「目标」面板里填目标和验收标准,然后点开始')
    return { hint: 'panel' }
  })

  // manifest 里声明了这个事件,所以它能把已被回收的 worker 重新唤醒。
  orca.events.on('agent.status.changed', () => {
    void mirror() // 不要 await:事件回调超 5 分钟会被 SIGKILL
  })

  await mirror()
}

export function deactivate() {
  stopPolling()
  api = null
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
  }
  pollTimer = null
}

/**
 * 只在有目标进行中时才轮询。
 * 每次 host.call 都会刷新宿主记的 lastActivityAt,持续轮询等于让空闲回收永远不触发;
 * 没活干还占着一个进程是不对的。没有活动目标就停表,靠 agent.status.changed 唤醒。
 */
function schedulePolling(hasActive) {
  if (hasActive && !pollTimer) {
    pollTimer = setInterval(() => void mirror(), ACTIVE_POLL_MS)
    if (typeof pollTimer.unref === 'function') {
      pollTimer.unref()
    }
  } else if (!hasActive) {
    stopPolling()
  }
}

/** 把 ~/.orca-goal 下的状态与逐轮日志汇总,写进 plugin storage 供面板读取。 */
async function mirror() {
  if (!api) {
    return
  }
  try {
    const goals = await Promise.all((await readGoals()).map(withRounds))
    schedulePolling(goals.some((g) => g.state === 'active' && g.driverAlive))

    const encoded = JSON.stringify(goals)
    if (encoded === lastMirrored) {
      return // 没变就不写,省一次 host 调用
    }
    lastMirrored = encoded
    await api.host.call('storage.set', { key: MIRROR_KEY, value: { updatedAt: Date.now(), goals } })
  } catch (err) {
    api?.log(`镜像目标状态失败:${err?.message || err}`)
  }
}

async function readGoals() {
  let names
  try {
    names = await fs.readdir(path.join(GOAL_HOME, 'goals'))
  } catch {
    return [] // 还没设过目标
  }
  const goals = []
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    try {
      goals.push(JSON.parse(await fs.readFile(path.join(GOAL_HOME, 'goals', name), 'utf8')))
    } catch {
      // 写到一半的文件跳过,下一次镜像会补上
    }
  }
  return goals.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

/**
 * 驱动进程还活着吗。
 * 「记录写着 active、驱动其实已经死了」是真实发生过的状态(进程崩溃、机器重启),
 * 面板必须能把它和「正在跑」区分开 —— 前者要给「接回」,后者要给「停止」。
 */
async function driverAlive(goal) {
  try {
    const { pid } = JSON.parse(
      await fs.readFile(path.join(GOAL_HOME, 'lock', `${goal.key}.lock`), 'utf8')
    )
    if (!Number.isInteger(pid)) {
      return false
    }
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM' // 进程在,但不属于当前用户
  }
}

/** 逐轮日志是 JSONL,只取最近若干轮供时间线渲染。 */
async function withRounds(goal) {
  try {
    const raw = await fs.readFile(path.join(GOAL_HOME, 'log', `${goal.key}.jsonl`), 'utf8')
    const rounds = []
    for (const line of raw.split('\n').filter(Boolean).slice(-ROUND_TAIL)) {
      try {
        rounds.push(JSON.parse(line))
      } catch {
        // 半行,跳过
      }
    }
    return { ...goal, rounds, driverAlive: await driverAlive(goal) }
  } catch {
    return { ...goal, rounds: [], driverAlive: await driverAlive(goal) }
  }
}

/**
 * 走登录 shell 起 orca-goal。
 * worker 的 env 是清洗过的白名单,PATH 来自 GUI 应用 —— fnm/nvm/asdf 的 shim 都不在里面,
 * 直接 spawn 会找不到 node。-lc 让它读一遍 profile,PATH 才是终端里那份。
 * 超时必须明显小于命令处理器的 30 秒上限,否则宿主先超时、这里的错误就没人看得见。
 */
function runCli(args) {
  return new Promise((resolve) => {
    const quoted = args.map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ')
    const child = spawn(process.env.SHELL || '/bin/zsh', ['-lc', `orca-goal ${quoted}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    const take = (d) => {
      if (out.length < 64_000) {
        out += d
      }
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ ok: false, output: `orca-goal ${args[0]} 超过 ${CLI_TIMEOUT_MS / 1000} 秒未返回` })
    }, CLI_TIMEOUT_MS)

    const settle = (result) => {
      clearTimeout(timer)
      resolve(result)
    }
    child.on('error', (err) => settle({ ok: false, output: String(err.message) }))
    child.on('close', (code) => settle({ ok: code === 0, code, output: out.slice(-4000) }))
  })
}

async function notify(body) {
  try {
    await api?.host.call('notifications.show', {
      title: '目标模式',
      body: String(body).slice(0, 240)
    })
  } catch (err) {
    api?.log(`通知失败:${err?.message || err}`)
  }
}
