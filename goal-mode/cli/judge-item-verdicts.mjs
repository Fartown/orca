// 条目级裁判判词:固定 criterionId 进,经校验的结果出。
//
// 旧模式只有一行 PASS/FAIL,整体结论没法拆到每条验收项上。条目模式由调用方给出
// 固定的 id 列表,裁判必须按 id 逐条回答;没回答、答重了、id 对不上、JSON 解析不了,
// 一律记 inconclusive —— 绝不用正则去自然语言里猜「哪条过了」。
// 判词以一行 ORCA_GOAL_JUDGE_ITEMS {json} 打头交给 gate,gate 把它摘出来存进验收结果。

export const ITEM_STATUSES = ['passed', 'failed', 'inconclusive']
export const ITEMS_MARKER = 'ORCA_GOAL_JUDGE_ITEMS '
const MARKER_MAX_BYTES = 512 * 1024

/** 提示词里的条目清单和输出契约。 */
export function itemsPromptSection(items, notes) {
  const list = items.map((item) => `- [${item.id}] ${item.description.trim()}`).join('\n')
  const noteBlock = notes?.trim()
    ? `\n<acceptance_notes>\n${notes.trim()}\n</acceptance_notes>\n`
    : ''
  return `<acceptance_items>
${list}
</acceptance_items>
${noteBlock}
输出契约:
- 逐条判定上面每一个 id,不要合并,不要遗漏,不要编造清单里没有的 id。
- 最后输出一个 \`\`\`json 代码块,内容形如:
  {"verdicts":[{"id":"<id>","status":"passed|failed|inconclusive","reason":"一句话说明你看到的证据","evidence":"文件:行 或 命令"}]}
- status 只能是 passed / failed / inconclusive;证据不足以证明达成就写 failed,你无法核实时写 inconclusive。
- 代码块之前可以写你的核对过程;代码块之后不要再写任何内容。`
}

/**
 * 从裁判原文里取出 JSON 判词并按声明的 id 校验。
 * @returns {{ verdicts: Array<{id: string, status: string, reason: string}>, problems: string[] }}
 */
export function parseItemVerdicts(text, declaredIds) {
  const problems = []
  const raw = locateVerdictJson(text)
  const byId = new Map()
  if (!raw) {
    problems.push('裁判没有输出可解析的 JSON 判词')
  } else if (!Array.isArray(raw.verdicts)) {
    problems.push('JSON 判词里没有 verdicts 数组')
  } else {
    for (const entry of raw.verdicts) {
      const id = typeof entry?.id === 'string' ? entry.id : null
      if (!id || !declaredIds.includes(id)) {
        problems.push(`裁判返回了清单外的 id:${id ?? '(缺失)'}`)
        continue
      }
      if (byId.has(id)) {
        byId.set(id, { status: 'inconclusive', reason: '裁判对同一条给出了多次结果' })
        continue
      }
      const status = ITEM_STATUSES.includes(entry.status) ? entry.status : 'inconclusive'
      const reason =
        typeof entry.reason === 'string' && entry.reason.trim()
          ? entry.reason.trim().slice(0, 500)
          : status === 'inconclusive'
            ? '裁判给出的 status 不合法'
            : ''
      byId.set(id, { status, reason })
    }
  }
  const fallback = problems[0] ?? '裁判没有对这一条给出结果'
  const verdicts = declaredIds.map((id) => ({
    id,
    ...(byId.get(id) ?? { status: 'inconclusive', reason: fallback })
  }))
  return { verdicts, problems }
}

/** 退出码沿用 gate 的约定:0 全过 · 1 有未通过 · 3 有判不了的。 */
export function overallExitCode(verdicts) {
  if (verdicts.some((verdict) => verdict.status === 'failed')) {
    return 1
  }
  if (verdicts.some((verdict) => verdict.status === 'inconclusive')) {
    return 3
  }
  return verdicts.length > 0 ? 0 : 3
}

export function formatItemVerdicts(verdicts, descriptions = new Map()) {
  const label = { passed: '✓', failed: '✗', inconclusive: '?' }
  return verdicts
    .map((verdict) => {
      const description = descriptions.get(verdict.id)
      const head = description ? `${description}` : verdict.id
      return `${label[verdict.status]} ${head}${verdict.reason ? ` —— ${verdict.reason}` : ''}`
    })
    .join('\n')
}

export function encodeItemsMarker(verdicts) {
  return `${ITEMS_MARKER}${JSON.stringify({ verdicts })}`
}

/**
 * gate 侧:把判词行从命令输出里摘出来。返回的 output 不再含那一行,回灌给 agent 的文本保持可读。
 * @returns {{ items: Array<{id: string, status: string, reason: string}> | null, output: string }}
 */
export function extractItemVerdicts(output) {
  const lines = output.split('\n')
  const index = lines.findIndex((line) => line.startsWith(ITEMS_MARKER))
  if (index === -1) {
    return { items: null, output }
  }
  const line = lines[index]
  const rest = [...lines.slice(0, index), ...lines.slice(index + 1)].join('\n')
  if (line.length > MARKER_MAX_BYTES) {
    return { items: null, output: rest }
  }
  try {
    const parsed = JSON.parse(line.slice(ITEMS_MARKER.length))
    if (!Array.isArray(parsed?.verdicts)) {
      return { items: null, output: rest }
    }
    const items = parsed.verdicts
      .filter((entry) => typeof entry?.id === 'string' && ITEM_STATUSES.includes(entry?.status))
      .map((entry) => ({
        id: entry.id,
        status: entry.status,
        reason: typeof entry.reason === 'string' ? entry.reason : ''
      }))
    return { items, output: rest }
  } catch {
    return { items: null, output: rest }
  }
}

function locateVerdictJson(text) {
  const fenced = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/g)]
  for (let index = fenced.length - 1; index >= 0; index -= 1) {
    const parsed = tryParse(fenced[index][1])
    if (parsed && typeof parsed === 'object' && 'verdicts' in parsed) {
      return parsed
    }
  }
  // 没有代码块:从后往前找一个能解析、且带 verdicts 的对象。
  let cursor = text.lastIndexOf('{"verdicts"')
  if (cursor === -1) {
    cursor = text.lastIndexOf('{')
  }
  while (cursor !== -1) {
    const candidate = tryParse(text.slice(cursor, lastBraceAfter(text, cursor) + 1))
    if (candidate && typeof candidate === 'object' && 'verdicts' in candidate) {
      return candidate
    }
    cursor = text.lastIndexOf('{', cursor - 1)
  }
  return null
}

function lastBraceAfter(text, from) {
  const index = text.lastIndexOf('}')
  return index > from ? index : from
}

function tryParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
