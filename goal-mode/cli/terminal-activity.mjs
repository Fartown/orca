// 判断 agent 这一轮跑完了没有,以及它是不是在等用户确认。
//
// 首选信号:`orca worktree ps --json` 里 worktrees[].agents[] 的 state。
// 它由 agent 的 hook 事件驱动(PermissionRequest/AskUserQuestion → waiting,Stop/StopFailure → done),
// 是 CLI 里唯一拿得到 `waiting` 的地方 —— 而这一档必须认出来:Claude 等权限确认时终端标题
// 仍然是 ✳,和「跑完了」完全同形,光看标题会把提示词打进权限对话框。
//
// 不用 `orca terminal wait --for tui-idle`:它只看 OSC 标题且状态是黏的(读了不清),
// 实测在 Claude 干活时也返回成功,在完全空闲的普通 shell 上反而一直超时。
import { listAgentRows, showTerminal } from './orca-terminal.mjs'

const BRAILLE = /^[⠀-⣿]/ // agent 自己吐的旋转动画帧

export async function observeAgent(handle) {
  const t = await showTerminal(handle)
  const paneKey = t.tabId && t.leafId ? `${t.tabId}:${t.leafId}` : null
  const row = paneKey ? (await listAgentRows()).find((a) => a.paneKey === paneKey) : null
  return {
    connected: t.connected !== false,
    state: row?.state ?? null,
    stateStartedAt: row?.stateStartedAt ?? null,
    silentMs: t.lastOutputAt ? Date.now() - t.lastOutputAt : null,
    spinning: BRAILLE.test((t.title || '').trim()),
    toolName: row?.toolName ?? null,
    source: row ? 'hook' : 'title'
  }
}

/**
 * @param {number} sinceMs 本轮注入的时刻。hook 状态是黏的,上一轮遗留的 done 不能当成本轮结束,
 *   所以只采信 stateStartedAt 晚于注入时刻的状态。
 * @returns {'disconnected'|'needs-user'|'finished'|'busy'|'quiet'|'unknown'}
 *   finished 是可以立即采信的结束(来自本轮的 hook 状态);
 *   quiet 只是「终端安静下来了」,要由调用方结合「这一轮到底动过没有」再判。
 */
export function classifyRound(activity, sinceMs, quietMs) {
  if (!activity.connected) {
    return 'disconnected'
  }

  // 本轮产生的 hook 状态最可信,能直接定论。
  if (activity.state && activity.stateStartedAt > sinceMs) {
    if (activity.state === 'waiting' || activity.state === 'blocked') {
      return 'needs-user'
    }
    if (activity.state === 'working') {
      return 'busy'
    }
    if (activity.state === 'done') {
      return 'finished'
    }
  }
  // 陈旧的 working 只有在终端确实还在动时才采信。
  // 注释原来断言「working 没有陈旧风险」,但它恰恰是最容易陈旧的一档:
  // 上一轮被 Esc 打断、agent 进程崩了、Stop hook 没发出来,状态就永久卡在 working。
  // 无条件采信的话,每次轮询都会把卡死计时刷新到当下 —— 那道闸门永远差一步,
  // 配「时长不限」就是永久挂起。所以这里不再短路,交给下面的 PTY 存活判断。

  // 走到这里说明拿不到本轮的 hook 状态 —— 可能是没有 hook 行,也可能是状态还停在上一轮。
  // 两种都必须看终端本身有没有动静:有的 agent(实测 kimi)thinking 阶段不发 hook 事件,
  // 状态能在上一轮的 done 上停一百多秒,但它的 TUI 一直在刷屏。
  // 早先这里对「有 hook 行但状态陈旧」直接返回 not-started,把刷着屏的 agent 判成了毫无动静。
  if (activity.spinning) {
    return 'busy'
  }
  if (activity.silentMs != null) {
    return activity.silentMs < quietMs ? 'busy' : 'quiet'
  }
  return 'unknown'
}
