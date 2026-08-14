// 把驱动进程放到后台。detached + unref 之后它不再挂在你的 shell 上,
// 关掉终端窗口也不会带走它;输出改写进日志文件,用 `orca-goal watch` 跟。
import { spawn } from 'node:child_process'
import { promises as fs, openSync } from 'node:fs'
import path from 'node:path'

export async function spawnDetached({ scriptPath, argv, logFile }) {
  await fs.mkdir(path.dirname(logFile), { recursive: true })
  await fs.appendFile(logFile, `\n=== ${new Date().toISOString()} 启动 ===\n`, 'utf8')

  const out = openSync(logFile, 'a')
  const child = spawn(process.execPath, [scriptPath, ...argv], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, ORCA_GOAL_DETACHED: '1' }
  })
  child.unref()
  return child.pid
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid)) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code !== 'ESRCH'
  }
}

/** 先 SIGTERM 给它清理锁的机会,不听话再 SIGKILL。 */
export async function stopProcess(pid, { graceMs = 3000 } = {}) {
  if (!isProcessAlive(pid)) {
    return 'not-running'
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return 'not-running'
  }
  const deadline = Date.now() + graceMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return 'stopped'
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    /* 已经没了 */
  }
  return 'killed'
}
