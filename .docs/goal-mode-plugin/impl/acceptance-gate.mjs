// 完成守卫:agent 声称完成时,由驱动进程独立重跑验收命令。
// 跑在 agent 会话之外,所以不受 hook 超时限制,几分钟的测试也扛得住。
import { spawn } from 'node:child_process'

const MAX_CAPTURE = 4000

export async function runAcceptance(acceptance, { onCommandStart } = {}) {
  const commands = acceptance?.commands || []
  const timeoutMs = acceptance?.timeoutMs ?? 900_000
  const cwd = acceptance?.cwd
  const results = []

  for (const command of commands) {
    onCommandStart?.(command)
    const result = await runOne(command, cwd, timeoutMs)
    results.push(result)
    if (!result.ok) {
      break
    } // 第一条失败就够了,不浪费时间跑后面的
  }

  return { passed: results.length > 0 && results.every((r) => r.ok), results }
}

function runOne(command, cwd, timeoutMs) {
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
        env: { ...process.env, CI: '1', ORCA_GOAL_ACCEPTANCE: '1' }
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
    let overflowed = false
    const capture = (chunk) => {
      if (output.length >= MAX_CAPTURE * 2) {
        overflowed = true
        return
      }
      output += chunk
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
        code,
        timedOut,
        output: truncate(output, overflowed) || (err ? String(err.message) : ''),
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

/** 保头保尾:命令名和最终错误通常分别在两端。 */
function truncate(text, overflowed) {
  if (!overflowed && text.length <= MAX_CAPTURE) {
    return text
  }
  const head = text.slice(0, Math.floor(MAX_CAPTURE / 3))
  const tail = text.slice(-Math.floor((MAX_CAPTURE * 2) / 3))
  return `${head}\n... [输出过长,已截断] ...\n${tail}`
}

export function describeFailures(acceptanceResult) {
  const failures = acceptanceResult.results.filter((r) => !r.ok)
  const list = failures
    .map((r) => {
      if (r.timedOut) {
        return `- \`${r.command}\` 超时(${Math.round(r.ms / 1000)}s)未完成`
      }
      if (r.code === null) {
        return `- \`${r.command}\` 无法执行`
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
