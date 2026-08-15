// 把驱动进程放到后台。detached + unref 之后它不再挂在你的 shell 上,
// 关掉终端窗口也不会带走它;输出改写进日志文件,用 `orca-goal watch` 跟。
import { execFileSync, spawn } from 'node:child_process'
import { promises as fs, openSync } from 'node:fs'
import path from 'node:path'

export async function spawnDetached({ scriptPath, argv, logFile }) {
  await fs.mkdir(path.dirname(logFile), { recursive: true })
  await fs.appendFile(logFile, `\n=== ${new Date().toISOString()} 启动 ===\n`, 'utf8')

  const out = openSync(logFile, 'a')
  const child = spawn(process.execPath, [scriptPath, ...argv], {
    detached: true,
    stdio: ['ignore', out, out],
    // 别继承启动时的 cwd:那个目录被删掉(`git stash` 挪走未跟踪文件就够了)会让进程
    // 在 uv_cwd 上直接崩掉,正跑着的目标就这么没了。状态目录是它唯一真正依赖的路径。
    cwd: path.dirname(logFile),
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

/**
 * 这个 pid 真的是本目标的驱动吗。
 *
 * 锁文件只在干净退出时删除,SIGKILL / 断电 / forget 之后都会残留;重启后 pid 空间重排,
 * 残留的 pid 极可能落到别的进程头上。此时 status 会报「驱动在跑」、start 被拒,
 * 而 stop 会对一个毫不相干的进程先 SIGTERM 再 SIGKILL —— 实测复现过。
 *
 * 所以在动手之前先核对进程的命令行确实是这个目标的驱动。核不出来(平台不支持、
 * 权限不够)时返回 null,由调用方决定是保守放过还是继续。
 */
export function isOurDriver(pid, key) {
  if (!isProcessAlive(pid)) {
    return false
  }
  if (process.platform === 'win32') {
    return null // Windows 上没有等价的廉价查法,交给调用方
  }
  try {
    const out = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return out.includes('orca-goal') && out.includes(key)
  } catch {
    return null
  }
}

/** 先 SIGTERM 给它清理锁的机会,不听话再 SIGKILL。 */
export async function stopProcess(pid, { graceMs = 3000, key } = {}) {
  if (!isProcessAlive(pid)) {
    return 'not-running'
  }
  // 宁可不停,也不能杀错人:锁文件残留 + pid 复用会让这个 pid 指向无关进程。
  if (key && isOurDriver(pid, key) === false) {
    return 'not-ours'
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
