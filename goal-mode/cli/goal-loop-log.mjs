// 逐轮日志:每次复盘与终局各留一条,目标不会「戛然而止」。
import { appendLog } from './goal-state.mjs'

export async function logReview(goal, wakeText, verdict, plan) {
  await appendLog(goal.key, {
    at: new Date().toISOString(),
    turn: goal.turns,
    prompt: wakeText,
    tree: goal.lastSnapshot?.kind === 'git' ? goal.lastSnapshot.tree : null,
    head: goal.lastSnapshot?.kind === 'git' ? goal.lastSnapshot.head : null,
    action: verdict.decision,
    plan: plan.type,
    state: goal.state,
    reason: verdict.observation || null,
    question: verdict.question || null
  }).catch(() => {})
}

/** 终局也在逐轮日志里留一条,目标不会「戛然而止」。 */
export async function logTerminal(goal) {
  await appendLog(goal.key, {
    at: new Date(goal.updatedAt || Date.now()).toISOString(),
    turn: goal.turns,
    prompt: null,
    tree: null,
    head: null,
    action: 'finish',
    state: goal.state,
    reason: goal.finishReason || null
  }).catch(() => {})
}
