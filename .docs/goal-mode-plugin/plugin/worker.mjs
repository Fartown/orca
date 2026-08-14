// 目标模式插件的 worker。
//
// 刻意不把循环写在这里 —— worker 空闲 5 分钟会被回收,事件回调超过 5 分钟直接 SIGKILL,
// 而一轮 agent 工作动辄十几分钟、一次验收可能跑半小时。所以执行体仍然是登录 shell 里的
// orca-goal 进程,worker 只做三件事:起停它、把状态镜像进 plugin storage 给面板看、发通知。
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const GOAL_HOME = process.env.ORCA_GOAL_HOME || path.join(os.homedir(), '.orca-goal')
const MIRROR_KEY = 'goals' // 面板读这个 key
const MIRROR_INTERVAL_MS = 3000

let orcaApi = null
let mirrorTimer = null
let lastMirror = ''

export default async function activate(orca) {
  orcaApi = orca
  orca.log(`目标模式插件已激活,授予的能力:${orca.grantedCapabilities.join(', ')}`)

  orca.commands.register('goal.status', async () => {
    const goals = await readGoals()
    const active = goals.filter((g) => g.state === 'active')
    await notify(
      active.length > 0
        ? `进行中 · 第 ${active[0].turns} 轮 · ${active[0].worktreePath}`
        : goals.length > 0
          ? `没有进行中的目标(共 ${goals.length} 条历史记录)`
          : '还没有设过目标'
    )
  })

  orca.commands.register('goal.stop', async () => {
    const active = (await readGoals()).filter((g) => g.state === 'active')
    if (active.length === 0) {
      return notify('没有进行中的目标')
    }
    for (const goal of active) {
      await runCli(['stop', '--terminal', goal.terminalHandle])
    }
    await notify(`已停止 ${active.length} 个目标`)
    await mirror(true)
  })

  // 命令拿不到参数,也没有「弹个输入框」的宿主 API,所以这条只能把人引到面板去。
  orca.commands.register('goal.start', async () => {
    await notify('在右侧「目标」面板里填目标和验收标准,然后点开始')
  })

  orca.events.on('agent.status.changed', () => {
    // agent 一有动静就刷新镜像 —— 比定时轮询更跟手,也顺带把 worker 从回收边缘拉回来。
    void mirror()
  })

  await mirror(true)
  mirrorTimer = setInterval(() => void mirror(), MIRROR_INTERVAL_MS)
  if (typeof mirrorTimer.unref === 'function') {
    mirrorTimer.unref()
  }
}

export function deactivate() {
  if (mirrorTimer) {
    clearInterval(mirrorTimer)
  }
  mirrorTimer = null
  orcaApi = null
}

/** 把 ~/.orca-goal 下的目标状态与逐轮日志汇总,写进 plugin storage 供面板读取。 */
async function mirror(force = false) {
  if (!orcaApi) {
    return
  }
  try {
    const goals = await readGoals()
    const payload = {
      updatedAt: Date.now(),
      goals: await Promise.all(goals.map(withRounds))
    }
    const encoded = JSON.stringify(payload.goals)
    if (!force && encoded === lastMirror) {
      return
    }
    lastMirror = encoded
    await orcaApi.host.call('storage.set', { key: MIRROR_KEY, value: payload })
  } catch (err) {
    orcaApi?.log(`镜像目标状态失败:${err?.message || err}`)
  }
}

async function readGoals() {
  try {
    const dir = path.join(GOAL_HOME, 'goals')
    const names = await fs.readdir(dir)
    const goals = []
    for (const name of names.filter((n) => n.endsWith('.json'))) {
      try {
        goals.push(JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')))
      } catch {
        // 半截写入的文件跳过,下一轮镜像会补上
      }
    }
    return goals.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  } catch {
    return []
  }
}

/** 逐轮日志是 JSONL,只取最近若干轮供时间线渲染。 */
async function withRounds(goal) {
  try {
    const raw = await fs.readFile(path.join(GOAL_HOME, 'log', `${goal.key}.jsonl`), 'utf8')
    const rounds = raw
      .split('\n')
      .filter(Boolean)
      .slice(-20)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean)
    return { ...goal, rounds }
  } catch {
    return { ...goal, rounds: [] }
  }
}

/**
 * 走登录 shell 起 orca-goal。
 * worker 的 env 是清洗过的白名单,PATH 来自 GUI 应用 —— fnm/nvm/asdf 的 shim 都不在里面,
 * 直接 spawn 会找不到 node。-lc 让它读一遍 profile,PATH 才是你终端里那份。
 */
function runCli(args) {
  return new Promise((resolve) => {
    const quoted = args.map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ')
    const child = spawn(process.env.SHELL || '/bin/zsh', ['-lc', `orca-goal ${quoted}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('error', (err) => resolve({ ok: false, output: String(err.message) }))
    child.on('close', (code) => resolve({ ok: code === 0, code, output: out.slice(-4000) }))
  })
}

async function notify(body) {
  try {
    await orcaApi?.host.call('notifications.show', {
      title: '目标模式',
      body: String(body).slice(0, 240)
    })
  } catch (err) {
    orcaApi?.log(`通知失败:${err?.message || err}`)
  }
}
