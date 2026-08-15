// 交互式选终端。把 terminal list 和 worktree ps 的 agent 行按 paneKey 对起来,
// 这样列表里能直接看出哪个终端有 agent、正在忙还是空着 —— 省得先跑一遍 terminals 再复制 handle。
import readline from 'node:readline/promises'
import { listAgentRows, listTerminals } from './orca-terminal.mjs'

const STATE_LABEL = {
  working: '干活中',
  waiting: '等你确认',
  blocked: '受阻',
  done: '空闲'
}

export async function listTerminalChoices() {
  const [terminals, rows] = await Promise.all([listTerminals(), listAgentRows().catch(() => [])])
  const byPane = new Map(rows.map((r) => [r.paneKey, r]))
  return terminals
    .map((t) => ({
      ...t,
      agent: byPane.get(`${t.tabId}:${t.leafId}`) || null
    }))
    .sort((a, b) => rank(a) - rank(b))
}

/** 有 agent 且空闲的排最前 —— 那才是能接管目标的终端。 */
function rank(t) {
  if (!t.agent) {
    return 3
  }
  if (t.agent.state === 'done') {
    return 0
  }
  if (t.agent.state === 'working') {
    return 1
  }
  return 2
}

export function formatChoice(t, index) {
  const state = t.agent ? STATE_LABEL[t.agent.state] || t.agent.state : '未检测到 agent'
  const kind = t.agent ? `${t.agent.agentType || 'agent'}/${state}` : state
  const title = (t.title || '(无标题)').replace(/^[\s✳✦⏲◇✋⠀-⣿]+/, '').replace(/\s+/g, ' ')
  return `${String(index + 1).padStart(2)}. [${kind}] ${t.worktreePath}\n     ${title.slice(0, 60)}`
}

export async function pickTerminal() {
  const choices = await listTerminalChoices()
  if (choices.length === 0) {
    throw new Error('没有找到运行中的 Orca 终端')
  }
  if (!process.stdin.isTTY) {
    throw new Error('非交互环境下必须显式指定 --terminal(可先跑 `orca-goal terminals` 查看)')
  }

  console.log('选一个跑着 agent 的终端(它应当是空闲的):\n')
  for (const [i, t] of choices.entries()) {
    console.log(formatChoice(t, i))
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`\n序号 [1-${choices.length}]: `)
  rl.close()

  const index = Number(answer.trim()) - 1
  if (!Number.isInteger(index) || index < 0 || index >= choices.length) {
    throw new Error(`无效序号: ${answer.trim()}`)
  }
  const picked = choices[index]
  if (!picked.agent) {
    console.log(
      '⚠ 这个终端里没检测到 agent。如果里面不是 claude/codex 之类的会话,循环会一直等不到回应。'
    )
  } else if (picked.agent.state === 'working') {
    console.log('⚠ 这个 agent 正在干活。注入会排在它当前这一轮之后。')
  }
  return picked
}
