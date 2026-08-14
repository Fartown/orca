// 目标状态的磁盘持久化。状态刻意放在 worktree 之外,agent 改不到自己的验收配置。
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const ROOT = process.env.ORCA_GOAL_HOME || path.join(os.homedir(), '.orca-goal')

const goalsDir = () => path.join(ROOT, 'goals')
const logDir = () => path.join(ROOT, 'log')
const lockDir = () => path.join(ROOT, 'lock')

/** 终端 handle 已是文件名安全的,但外部输入仍要挡一道。 */
export function goalKey(terminalHandle) {
  const key = String(terminalHandle).replace(/[^A-Za-z0-9_.-]/g, '_')
  if (!key || key === '.' || key === '..') {
    throw new Error(`非法 terminal handle: ${terminalHandle}`)
  }
  return key
}

export const goalPath = (key) => path.join(goalsDir(), `${key}.json`)
export const logPath = (key) => path.join(logDir(), `${key}.jsonl`)

export function newGoal({
  key,
  objective,
  worktreePath,
  terminalHandle,
  acceptance,
  budget,
  promptFile,
  now
}) {
  return {
    version: 1,
    key,
    objective,
    worktreePath,
    terminalHandle,
    acceptance, // { commands: string[], timeoutMs, cwd }
    budget, // { maxTurns, maxMinutes }
    promptFile: Boolean(promptFile), // 提示词落文件、只注入一行指针
    state: 'active', // active | complete | blocked | budget_exhausted | stalled | aborted
    turns: 0,
    falseClaims: 0,
    blockedClaims: 0,
    stallCount: 0,
    tamperFindings: [], // 削弱验收的痕迹,跨轮累积
    tamperChallenges: 0,
    startedAt: now,
    updatedAt: now,
    lastSnapshot: null,
    lastCursor: null,
    roundMarker: null,
    finishedAt: null,
    finishReason: null
  }
}

export async function readGoal(key) {
  try {
    return JSON.parse(await fs.readFile(goalPath(key), 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null
    }
    throw err
  }
}

/** 先写临时文件再 rename —— 崩在半路也不会留下截断的 JSON。 */
export async function writeGoal(goal) {
  await fs.mkdir(goalsDir(), { recursive: true })
  const target = goalPath(goal.key)
  const tmp = `${target}.${process.pid}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(goal, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, target)
}

export async function deleteGoal(key) {
  await fs.rm(goalPath(key), { force: true })
}

export async function listGoals() {
  let names
  try {
    names = await fs.readdir(goalsDir())
  } catch (err) {
    if (err.code === 'ENOENT') {
      return []
    }
    throw err
  }
  const goals = await Promise.all(
    names.filter((n) => n.endsWith('.json')).map((n) => readGoal(n.slice(0, -5)))
  )
  return goals.filter(Boolean)
}

export async function appendLog(key, entry) {
  await fs.mkdir(logDir(), { recursive: true })
  await fs.appendFile(logPath(key), `${JSON.stringify(entry)}\n`, 'utf8')
}

/** 独占锁:同一个目标只能有一个驱动进程。'wx' 创建失败即已被占用。 */
export async function acquireLock(key) {
  await fs.mkdir(lockDir(), { recursive: true })
  const file = path.join(lockDir(), `${key}.lock`)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(file, 'wx')
      await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }))
      await handle.close()
      return { file, release: () => fs.rm(file, { force: true }) }
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err
      }
      if (attempt === 1) {
        break
      }
      if (!(await isLockStale(file))) {
        break
      }
      await fs.rm(file, { force: true }) // 持有者已死,回收后重试一次
    }
  }
  const holder = await fs.readFile(file, 'utf8').catch(() => '?')
  throw new Error(`目标 ${key} 已有驱动进程在跑 (${holder.trim()})。先停掉它,或删除 ${file}`)
}

/** 锁文件里记着驱动进程的 pid,status/stop/watch 都靠它判断驱动还在不在。 */
export async function readLockPid(key) {
  try {
    const { pid } = JSON.parse(await fs.readFile(path.join(lockDir(), `${key}.lock`), 'utf8'))
    return Number.isInteger(pid) ? pid : null
  } catch {
    return null
  }
}

async function isLockStale(file) {
  try {
    const { pid } = JSON.parse(await fs.readFile(file, 'utf8'))
    if (!Number.isInteger(pid)) {
      return true
    }
    process.kill(pid, 0)
    return false
  } catch (err) {
    return err.code === 'ESRCH' || err instanceof SyntaxError || err.code === 'ENOENT'
  }
}
