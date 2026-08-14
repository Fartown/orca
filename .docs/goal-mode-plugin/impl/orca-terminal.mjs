// Orca 公开 CLI 的薄封装。走 CLI 而不是插件 API,是因为 CLI 给得到 worktreePath,
// 而且不要求目标 worktree 处于聚焦状态。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const ORCA_BIN = process.env.ORCA_BIN || 'orca'

async function orca(args, { timeoutMs = 30_000 } = {}) {
  let stdout
  try {
    ;({ stdout } = await run(ORCA_BIN, [...args, '--json'], {
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024
    }))
  } catch (err) {
    // 超时等失败路径 orca 仍会把 JSON 信封写到 stdout,先尝试解析再决定报什么错。
    const parsed = err.stdout && tryParse(err.stdout)
    if (parsed) {
      return parsed
    }
    throw new Error(`orca ${args[0]} ${args[1]} 执行失败: ${err.shortMessage || err.message}`)
  }
  const parsed = tryParse(stdout)
  if (!parsed) {
    throw new Error(`orca ${args.join(' ')} 返回的不是 JSON: ${stdout.slice(0, 200)}`)
  }
  return parsed
}

/** shell profile 可能往输出里掺行(如 fnm 的版本提示),从第一个 { 开始解析。 */
function tryParse(text) {
  const start = text.indexOf('{')
  if (start === -1) {
    return null
  }
  try {
    return JSON.parse(text.slice(start))
  } catch {
    return null
  }
}

function unwrap(envelope, what) {
  if (!envelope.ok) {
    const err = new Error(envelope.error?.message || 'unknown')
    err.code = envelope.error?.code
    err.what = what
    throw err
  }
  return envelope.result
}

export async function listTerminals() {
  return unwrap(await orca(['terminal', 'list']), 'list').terminals || []
}

export async function findTerminal(handle) {
  return (await listTerminals()).find((t) => t.handle === handle) || null
}

/** hook 驱动的 agent 状态行。CLI 里只有这条命令给得到 `waiting`,按 paneKey(tabId:leafId)对齐终端。 */
export async function listAgentRows() {
  const result = unwrap(await orca(['worktree', 'ps']), 'ps')
  return (result.worktrees || []).flatMap((w) => w.agents || [])
}

export async function showTerminal(handle) {
  return unwrap(await orca(['terminal', 'show', '--terminal', handle]), 'show').terminal
}

export async function readTerminal(handle, { limit = 2000, cursor } = {}) {
  const args = ['terminal', 'read', '--terminal', handle, '--limit', String(limit)]
  if (cursor != null) {
    args.push('--cursor', String(cursor))
  }
  return unwrap(await orca(args), 'read').terminal
}

/**
 * 注意两件事:
 * 1. `\n` 会被原样写进 PTY(0x0A),TUI 当回车 —— 所以文本必须已压成单行,见 continuation-prompt.js。
 * 2. 移动端持有该 PTY 的输入锁时,orca 返回 ok:true 但 accepted:false 且一个字节都没写。
 *    不查这个字段就会静默丢一整轮注入。
 */
export async function sendText(handle, text, { enter = true } = {}) {
  if (/[\r\n]/.test(text)) {
    throw new Error('sendText 收到多行文本:换行会被 TUI 当作回车提前提交')
  }
  const args = ['terminal', 'send', '--terminal', handle, '--text', text]
  if (enter) {
    args.push('--enter')
  }
  const result = unwrap(await orca(args, { timeoutMs: 120_000 }), 'send')
  if (result.accepted === false) {
    throw new Error('终端拒绝了输入(通常是移动端客户端正持有该终端的输入锁),本轮未写入任何字节')
  }
  return result
}

/** @returns {{idle: boolean, reason: string}} 超时不抛错 —— 「还在干活」是正常状态,不是异常。 */
export async function waitIdle(handle, timeoutMs) {
  const envelope = await orca(
    [
      'terminal',
      'wait',
      '--terminal',
      handle,
      '--for',
      'tui-idle',
      '--timeout-ms',
      String(timeoutMs)
    ],
    { timeoutMs: timeoutMs + 15_000 }
  )
  if (envelope.ok) {
    return { idle: true, reason: 'tui-idle' }
  }
  if (envelope.error?.code === 'timeout') {
    return { idle: false, reason: 'timeout' }
  }
  const err = new Error(envelope.error?.message || 'wait 失败')
  err.code = envelope.error?.code
  throw err
}
