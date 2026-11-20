// 执行 agent 停在确认框时,按守卫的意见替它按键。
//
// 按键和画面都是实测的(2026-11-20,Claude Code 2.1.329、codex-cli 0.171.0,
// 证据 .docs/goal-confirm-box-ui-validation/2026-11-20/):两家的第一项都是「Yes」,按 1 即同意;
// Esc 都是取消(Claude 回到输入框问「What should Claude do instead?」,codex 回到输入框)。
// 认不出来、画面变了、按完还在,一律不再按:对着看不清的界面按键比不按更危险。
const FAMILIES = {
  claude: {
    question: /^\s*Do you want to .+\?\s*$/,
    footer: /Esc to cancel/
  },
  codex: {
    question: /^\s*Would you like to .+\?\s*$/,
    footer: /Press enter to confirm or esc to cancel/
  }
}
const OPTION = /^\s*[❯›>]?\s*\d+\.\s/
const FIRST_YES = /^\s*[❯›>]?\s*1\.\s+Yes\b/
const KEYS = { approve: '1', reject: '\x1b' }
// 页脚之后只允许状态栏这几行;再往下还有内容说明框已不在最底部。
const FOOTER_SLACK = 3
const SETTLE_MS = Number(process.env.ORCA_GOAL_CONFIRM_SETTLE_MS) || 5_000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 从屏幕行里找当前的确认框。
 * @param {string[]} lines 屏幕上的行(终端画面,不是滚动历史)
 * @param {string|null} agentType 状态行里的 agent 家族;未知时两家都试
 * @returns {{ family: string, text: string } | null} text 是从问题到页脚的原文,用来核对是不是同一个框
 */
export function findConfirmBox(lines, agentType) {
  const rows = (lines || []).map((line) => String(line).replace(/\s+$/, '')).filter(Boolean)
  const families = FAMILIES[agentType] ? [agentType] : Object.keys(FAMILIES)
  for (const family of families) {
    const { question, footer } = FAMILIES[family]
    let end = -1
    for (let i = rows.length - 1; i >= Math.max(0, rows.length - 1 - FOOTER_SLACK); i--) {
      if (footer.test(rows[i])) {
        end = i
        break
      }
    }
    if (end < 0) {
      continue
    }
    let start = -1
    for (let i = end - 1; i >= 0 && i >= end - 40; i--) {
      if (question.test(rows[i])) {
        start = i
        break
      }
    }
    const firstOption = rows.slice(start + 1, end).find((row) => OPTION.test(row))
    if (start < 0 || !firstOption || !FIRST_YES.test(firstOption)) {
      continue
    }
    return { family, text: rows.slice(start, end + 1).join('\n') }
  }
  return null
}

/**
 * 看一眼终端画面上的确认框;读不到画面就当没有。
 * @param {{ readScreen: (handle: string) => Promise<{lines: string[]} | null> }} terminal
 */
export async function captureConfirmBox(terminal, handle, agentType) {
  try {
    const screen = await terminal.readScreen(handle)
    return screen ? findConfirmBox(screen.lines, agentType) : null
  } catch {
    return null
  }
}

/**
 * 按守卫的意见操作确认框。
 * @param {object} args
 * @param {{ readScreen: Function, sendKeys: (handle: string, keys: string) => Promise<unknown> }} args.terminal
 * @param {string} args.handle
 * @param {string|null} args.agentType
 * @param {'approve'|'reject'} args.choice
 * @param {{family: string, text: string}|null} args.seen 守卫被叫来之前画面上的框;守卫判断的是它
 * @returns {Promise<{ outcome: 'pressed'|'no-box'|'changed'|'still-there', detail: string }>}
 */
export async function answerConfirmBox({ terminal, handle, agentType, choice, seen }) {
  if (!seen) {
    return { outcome: 'no-box', detail: '唤醒守卫时画面上没有认得出的确认框,不按键' }
  }
  const now = await captureConfirmBox(terminal, handle, agentType)
  if (!now || now.text !== seen.text) {
    return { outcome: 'changed', detail: '确认框已经不是守卫看到的那一个,不按键' }
  }
  await terminal.sendKeys(handle, KEYS[choice])
  const deadline = Date.now() + SETTLE_MS
  while (Date.now() < deadline) {
    await sleep(250)
    const after = await captureConfirmBox(terminal, handle, agentType)
    if (!after || after.text !== seen.text) {
      return {
        outcome: 'pressed',
        detail: choice === 'approve' ? '已替它同意确认框' : '已替它拒绝确认框'
      }
    }
  }
  return { outcome: 'still-there', detail: '按键后确认框还在,不再重按' }
}

/** 这一次等待的标识:状态开始时间,加上画面上确认框的原文。连着弹的框状态行不变,只能靠原文区分。 */
export async function waitKeyOf(terminal, handle, agentType, stateStartedAt) {
  const box = await captureConfirmBox(terminal, handle, agentType)
  return `${stateStartedAt ?? 0}${box ? `|${box.text}` : ''}`
}

/** 画面读得到,且上面已经没有确认框。 */
export async function screenShowsNoBox(terminal, handle, agentType) {
  const screen = await terminal.readScreen(handle).catch(() => null)
  return screen !== null && !findConfirmBox(screen.lines, agentType)
}

/**
 * 守卫给了意见就按键,按完等状态存储跟上,免得紧接着的指示因为还显示「在等确认」而发不出去。
 * @returns {Promise<{ outcome: string, detail: string } | null>} 没给意见返回 null
 */
export async function applyConfirmVerdict({ choice, stillWaiting, pollMs, ...box }) {
  if (!choice) {
    return null
  }
  const result = await answerConfirmBox({ ...box, choice })
  if (result.outcome === 'pressed') {
    const deadline = Date.now() + SETTLE_MS
    while (Date.now() < deadline && (await stillWaiting().catch(() => false))) {
      await sleep(pollMs)
    }
  }
  return result
}
