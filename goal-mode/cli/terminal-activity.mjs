// 读执行 agent 此刻的状态。只搬运状态存储给出的事实,不在读取端重新裁决(docs/reference/agent-status-store.md)。
//
// 首选信号:`orca worktree ps --json` 里 worktrees[].agents[] 的状态行,由 agent 的 hook 事件驱动。
// 没有状态行的 agent 只能退回标题字形和终端静默 —— 那只用来决定「叫守卫来看」,不决定任何结局。
import { listAgentRows, showTerminal } from './orca-terminal.mjs'

const BRAILLE = /^[⠀-⣿]/ // agent 自己吐的旋转动画帧

export async function observeAgent(handle) {
  const t = await showTerminal(handle)
  const paneKey = t.tabId && t.leafId ? `${t.tabId}:${t.leafId}` : null
  const row = paneKey ? (await listAgentRows()).find((a) => a.paneKey === paneKey) : null
  const requiresHook = process.env.ORCA_GOAL_TERMINAL_BACKEND === 'ssh-cli'
  if (requiresHook && (!row || row.restoredUnconfirmed || row.providerSessionOnly)) {
    const error = new Error('The remote agent hook state is unverifiable')
    error.code = 'goal_host_unverifiable'
    throw error
  }
  return {
    connected: t.connected !== false,
    row: row
      ? {
          state: row.state ?? null,
          workingMode: row.workingMode ?? null,
          stateStartedAt: row.stateStartedAt ?? null,
          prompt: typeof row.prompt === 'string' ? row.prompt : '',
          agentType: row.agentType ?? null,
          transcriptPath: row.transcriptPath ?? null,
          toolName: row.toolName ?? null
        }
      : null,
    silentMs: t.lastOutputAt ? Date.now() - t.lastOutputAt : null,
    spinning: BRAILLE.test((t.title || '').trim())
  }
}

/**
 * @returns {'disconnected'|'needs-user'|'ended'|'busy'|'quiet'|'unknown'}
 *   ended:状态存储说这一轮讲完了(done,或 working 且 workingMode 为 monitoring —— 只剩后台 shell 挂着)。
 *   quiet:没有状态行时终端安静了,只能当作「可能结束了」交给守卫看。
 */
export function describeActivity(activity, quietMs) {
  if (!activity.connected) {
    return 'disconnected'
  }
  const row = activity.row
  if (row?.state) {
    if (row.state === 'waiting' || row.state === 'blocked') {
      return 'needs-user'
    }
    if (row.state === 'done' || (row.state === 'working' && row.workingMode === 'monitoring')) {
      return 'ended'
    }
    if (row.state === 'working') {
      return 'busy'
    }
  }
  if (activity.spinning) {
    return 'busy'
  }
  if (activity.silentMs != null) {
    return activity.silentMs < quietMs ? 'busy' : 'quiet'
  }
  return 'unknown'
}
