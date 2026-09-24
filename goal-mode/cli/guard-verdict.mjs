// 守卫结论的格式校验。只校验格式,不校验推理 —— 判断是守卫的事。
import { lastFencedJson } from './judge-item-verdicts.mjs'

export const GUARD_DECISIONS = ['wait', 'instruct', 'ask_user', 'done']
const FIELDS = ['decision', 'observation', 'instruction', 'question', 'note']
// 笔记是守卫的记忆,每次原样交还;设上限免得一次失控的输出撑爆记录。
const LIMITS = { observation: 2_000, instruction: 6_000, question: 2_000, note: 12_000 }

/**
 * @returns {{ ok: true, verdict: {decision: string, observation: string, instruction: string, question: string, note: string} } | { ok: false, error: string }}
 */
export function parseGuardVerdict(text) {
  const raw = lastFencedJson(String(text ?? ''), (value) => 'decision' in value)
  if (!raw) {
    return { ok: false, error: '没有找到包含 decision 字段的 json 代码块' }
  }
  const missing = FIELDS.filter((field) => !(field in raw))
  if (missing.length > 0) {
    return { ok: false, error: `缺少字段:${missing.join('、')}` }
  }
  const nonString = FIELDS.filter((field) => typeof raw[field] !== 'string')
  if (nonString.length > 0) {
    return { ok: false, error: `这些字段的值不是字符串:${nonString.join('、')}` }
  }
  const decision = raw.decision.trim()
  if (!GUARD_DECISIONS.includes(decision)) {
    return {
      ok: false,
      error: `decision 只能是 ${GUARD_DECISIONS.join('、')} 之一,收到的是「${raw.decision}」`
    }
  }
  const verdict = { decision }
  for (const [field, max] of Object.entries(LIMITS)) {
    verdict[field] = raw[field].trim().slice(0, max)
  }
  if (decision === 'instruct' && !verdict.instruction) {
    return { ok: false, error: 'decision 是 instruct 时 instruction 不能为空' }
  }
  if ((decision === 'wait' || decision === 'done') && verdict.instruction) {
    return { ok: false, error: `decision 是 ${decision} 时 instruction 必须是空字符串` }
  }
  if (decision === 'ask_user' && !verdict.question) {
    return { ok: false, error: 'decision 是 ask_user 时 question 不能为空' }
  }
  if (decision === 'done' && verdict.question) {
    return { ok: false, error: 'decision 是 done 时 question 必须是空字符串' }
  }
  return { ok: true, verdict }
}
