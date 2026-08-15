// 完成守卫:agent 声称完成时,由驱动进程独立重跑验收命令。
// 跑在 agent 会话之外,所以不受 hook 超时限制,几分钟的测试也扛得住。
import { spawn } from 'node:child_process'

const MAX_CAPTURE = 4000
// 约定:检查命令用退出码 3 表示「我没能做出判定」(而不是「判定为否」)。
// orca-goal-judge 遵守这个约定。普通测试命令不会用 3,所以对它们没有影响。
// 这个区分是必须的:门禁自己坏了的时候,守卫已经没有判定能力,
// 再把它记成「agent 反复声称完成却过不了」就是把自己的故障写成对方的诚信问题。
const EXIT_INCONCLUSIVE = 3

export async function runAcceptance(acceptance, { onCommandStart, env } = {}) {
  // 默认第一条失败就停:不浪费几十分钟去跑注定要重来的后几条,也强制按顺序修。
  // acceptance.all 为真时跑完全部,用来一次拿到全景(orca-goal 的 --check-all)。
  const runAll = Boolean(acceptance?.all)
  const commands = acceptance?.commands || []
  const timeoutMs = acceptance?.timeoutMs ?? 900_000
  const cwd = acceptance?.cwd
  const results = []

  for (const command of commands) {
    onCommandStart?.(command)
    const result = await runOne(command, cwd, timeoutMs, env)
    results.push(result)
    if (!result.ok && !runAll) {
      break
    }
  }

  // 有任何一条没判成,整次验收就不是一个可用的判定 —— 别拿它当「未达成」的证据。
  const inconclusive = results.some((r) => r.inconclusive)
  return {
    passed: !inconclusive && results.length > 0 && results.every((r) => r.ok),
    inconclusive,
    results
  }
}

function runOne(command, cwd, timeoutMs, env) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let child
    try {
      child = spawn(command, {
        cwd,
        shell: true,
        // 明确不给 TTY:交互式提示会挂住,管道让它们直接失败退出。
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        env: { ...process.env, CI: '1', ORCA_GOAL_ACCEPTANCE: '1', ...env }
      })
    } catch (err) {
      resolve({
        command,
        ok: false,
        code: null,
        timedOut: false,
        output: `无法启动: ${err.message}`,
        ms: 0
      })
      return
    }

    let output = ''
    let tail = ''
    let overflowed = false
    const capture = (chunk) => {
      // 头尾分开留:早先到 8000 字就不再追加,于是「保尾」保的是前 8000 字的尾巴,
      // 真正的失败原因(通常在最后几行)一个字都留不下 —— 而那是回灌给 agent 的唯一证据。
      if (output.length < MAX_CAPTURE) {
        output += chunk
      } else {
        overflowed = true
        tail = (tail + chunk).slice(-MAX_CAPTURE)
      }
    }
    child.stdout.on('data', (d) => capture(d.toString()))
    child.stderr.on('data', (d) => capture(d.toString()))

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutMs)

    const settle = (code, err) => {
      clearTimeout(timer)
      resolve({
        command,
        ok: !timedOut && !err && code === 0,
        // 起不来、超时、或命令自己说「没判成」—— 这三种都不是判定结果
        inconclusive: Boolean(err) || timedOut || code === EXIT_INCONCLUSIVE,
        code,
        timedOut,
        output: truncate(output, tail, overflowed) || (err ? String(err.message) : ''),
        ms: Date.now() - startedAt
      })
    }
    child.on('error', (err) => settle(null, err))
    child.on('close', (code) => settle(code))
  })
}

function killTree(child) {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      process.kill(-child.pid, 'SIGKILL') // detached 建了进程组,连子进程一起收
    }
  } catch {
    child.kill('SIGKILL')
  }
}

/**
 * 保头保尾:命令名通常在开头,真正的失败原因几乎总在最后几行。
 * head 是流式采集的前 MAX_CAPTURE 字,tail 是**真实结尾**的滚动窗口 ——
 * 两者分开采集,否则一旦超出上限就再也拿不到结尾了。
 */
function truncate(head, tail, overflowed) {
  if (!overflowed) {
    return head
  }
  return `${head.slice(0, Math.floor(MAX_CAPTURE / 3))}\n... [输出过长,已截断] ...\n${tail}`
}

export function describeFailures(acceptanceResult) {
  const failures = acceptanceResult.results.filter((r) => !r.ok)
  const list = failures
    .map((r) => {
      if (r.timedOut) {
        return `- \`${r.command}\` 超时(${Math.round(r.ms / 1000)}s)未能给出判定`
      }
      if (r.code === null) {
        return `- \`${r.command}\` 无法执行`
      }
      if (r.code === EXIT_INCONCLUSIVE) {
        return `- \`${r.command}\` 未能给出判定(不是判定为否)`
      }
      return `- \`${r.command}\` 退出码 ${r.code}`
    })
    .join('\n')
  return {
    list,
    output: failures
      .map((r) => r.output)
      .join('\n---\n')
      .trim()
  }
}
