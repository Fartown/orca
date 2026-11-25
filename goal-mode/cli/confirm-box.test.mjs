// 确认框识别与按键。屏幕样例取自 2026-11-20 实测(Claude Code 2.1.329、codex-cli 0.171.0)。
import assert from 'node:assert/strict'
import test from 'node:test'

const CLAUDE = [
  '⏺ Agent(Run date into sub.txt)',
  ' Bash command · from the general-purpose agent',
  ' date > /tmp/out/sub.txt',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. Yes, and always allow access to /tmp/out from this project',
  '   3. Yes, and switch to auto mode · auto mode handles these prompts for you',
  '   4. No',
  ' Esc to cancel · Tab to amend · ctrl+x ctrl+k twice to stop background agents'
]
const CODEX = [
  '• Running date > /tmp/out/approved.txt',
  '  Would you like to run the following command?',
  '  Environment: local',
  '  $ date > /tmp/out/approved.txt',
  '› 1. Yes, proceed (y)',
  "  2. Yes, and don't ask again for commands that start with `date` (p)",
  '  3. No, and tell Codex what to do differently (esc)',
  '  Press enter to confirm or esc to cancel'
]
const CLAUDE_TRUST = [
  ' Quick safety check: Is this a project you created or one you trust?',
  ' ❯ No, exit',
  '   Yes, I trust this folder',
  ' Enter to confirm · Esc to cancel'
]
const CLAUDE_INPUT = ['⏺ 命令已运行。', '────', '❯ ', '────', '  ⏸ manual mode on']

const world = { screen: null, keys: [], onKeys: null }
const terminal = {
  readScreen: async () => (world.screen ? { lines: world.screen } : null),
  sendKeys: async (_handle, keys) => {
    world.keys.push(keys)
    world.onKeys?.(keys)
  }
}
process.env.ORCA_GOAL_CONFIRM_SETTLE_MS = '600'
const { answerConfirmBox, captureConfirmBox, findConfirmBox } = await import('./confirm-box.mjs')

test('认得出两家的确认框,包括子 agent 发起的', () => {
  assert.equal(findConfirmBox(CLAUDE, 'claude')?.family, 'claude')
  assert.equal(findConfirmBox(CODEX, 'codex')?.family, 'codex')
  assert.equal(findConfirmBox(CODEX, null)?.family, 'codex', '不知道家族时两家都试')
  assert.match(findConfirmBox(CLAUDE, 'claude').text, /^ Do you want to proceed\?/)
})

test('不是「1. Yes」开头的框、普通输入框、页脚不在最底部的,都不算', () => {
  assert.equal(findConfirmBox(CLAUDE_TRUST, 'claude'), null)
  assert.equal(findConfirmBox(CLAUDE_INPUT, 'claude'), null)
  assert.equal(findConfirmBox([...CODEX, 'a', 'b', 'c', 'd'], 'codex'), null)
  assert.equal(findConfirmBox(CODEX, 'claude'), null, '家族已知时只认这一家')
})

const reset = (screen, onKeys = null) => {
  world.screen = screen
  world.keys = []
  world.onKeys = onKeys
}

test('同意按 1、拒绝按 Esc;按完框消失才算处理了', async () => {
  for (const [choice, key] of [
    ['approve', '1'],
    ['reject', '\x1b']
  ]) {
    reset(CODEX, () => (world.screen = ['• Ran date']))
    const seen = await captureConfirmBox(terminal, 't', 'codex')
    const result = await answerConfirmBox({
      terminal,
      handle: 't',
      agentType: 'codex',
      choice,
      seen
    })
    assert.equal(result.outcome, 'pressed')
    assert.deepEqual(world.keys, [key])
  }
})

test('守卫被叫来时没有框、或画面已经换了,一个键都不按', async () => {
  reset(CLAUDE)
  let result = await answerConfirmBox({
    terminal,
    handle: 't',
    agentType: 'claude',
    choice: 'approve',
    seen: null
  })
  assert.equal(result.outcome, 'no-box')
  const seen = { family: 'claude', text: 'Do you want to proceed?\n别的框' }
  result = await answerConfirmBox({
    terminal,
    handle: 't',
    agentType: 'claude',
    choice: 'approve',
    seen
  })
  assert.equal(result.outcome, 'changed')
  reset(null)
  result = await answerConfirmBox({
    terminal,
    handle: 't',
    agentType: 'claude',
    choice: 'approve',
    seen: findConfirmBox(CLAUDE, 'claude')
  })
  assert.equal(result.outcome, 'changed', '读不到画面就当确认不了')
  assert.deepEqual(world.keys, [])
})

test('按完框还在就报出来,不重按', async () => {
  reset(CLAUDE)
  const seen = await captureConfirmBox(terminal, 't', 'claude')
  const result = await answerConfirmBox({
    terminal,
    handle: 't',
    agentType: 'claude',
    choice: 'approve',
    seen
  })
  assert.equal(result.outcome, 'still-there')
  assert.deepEqual(world.keys, ['1'])
})
