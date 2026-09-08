// 整体判词:自由文本裁判只给一条整体结论,走和条目模式同一条判词行,占用一个保留 id。
//
// 只认第一行非空行的表态。读不出结论(空判词、裁判自己报的错、跑题的散文)一律 inconclusive ——
// 早先这里把「没判成」折成 FAIL,于是裁判坏掉会被记成 agent 假报完成。
import {
  GOAL_WHOLE_VERDICT_ID,
  GOAL_WHOLE_VERDICT_TEXT_MAX
} from '../../src/shared/goals/goal-judge-contract.ts'

export { GOAL_WHOLE_VERDICT_ID }

export function wholeVerdictOf(status, reason) {
  return {
    id: GOAL_WHOLE_VERDICT_ID,
    status,
    reason: String(reason ?? '').slice(0, GOAL_WHOLE_VERDICT_TEXT_MAX)
  }
}

export function parseWholeVerdict(text) {
  const raw = String(text ?? '').trim()
  if (!raw) {
    return wholeVerdictOf('inconclusive', '裁判没有给出任何判词')
  }
  const head = (raw.split('\n').find((line) => line.trim()) ?? '').trim()
  if (/^PASS\b/i.test(head)) {
    return wholeVerdictOf('passed', raw)
  }
  if (/^FAIL\b/i.test(head)) {
    return wholeVerdictOf('failed', raw)
  }
  return wholeVerdictOf('inconclusive', `裁判没有以 PASS 或 FAIL 开头表态,判词原文:\n${raw}`)
}
