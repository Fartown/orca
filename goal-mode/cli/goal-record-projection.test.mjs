// 宿主记录 → 驱动验收命令:选了裁判且有无命令的验收项时,才追加一条条目模式裁判命令。
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acceptanceOf,
  applyRecordToGoal,
  judgeCommandOf,
  quoteForShell
} from './goal-record-projection.mjs'

const record = (spec = {}) => ({
  goalId: 'g',
  specRevision: 2,
  workspace: { path: '/tmp/my repo' },
  binding: { terminal: 'term_1' },
  budget: { maxTurns: 3, maxMinutes: 0, checkTimeoutSeconds: 120 },
  spec: {
    objective: '目标',
    criteria: [
      { id: 'c1', description: '测试通过', command: 'pnpm test' },
      { id: 'c2', description: '文档写了用法' }
    ],
    acceptanceText: '',
    extraChecks: ['pnpm lint'],
    checkAll: false,
    onBlocked: 'ask',
    judge: 'claude',
    ...spec
  }
})

const options = {
  judgeEntry: '/app/goal-driver/acceptance-judge.js',
  itemsPath: '/home/u/.orca-goal/v2/goals/g/judge-items.json',
  execPath: '/Applications/Orca.app/Contents/MacOS/Orca',
  platform: 'darwin'
}

test('裁判命令排在命令类检查之后,只读沙箱,超时沿用检查超时', () => {
  const acceptance = acceptanceOf(record(), options)
  assert.equal(acceptance.commands.length, 3)
  assert.deepEqual(acceptance.commands.slice(0, 2), ['pnpm test', 'pnpm lint'])
  assert.equal(
    acceptance.commands[2],
    "'/Applications/Orca.app/Contents/MacOS/Orca' '/app/goal-driver/acceptance-judge.js' --agent claude --cwd '/tmp/my repo' --items-file '/home/u/.orca-goal/v2/goals/g/judge-items.json' --timeout 120 --sandbox read-only"
  )
})

test('没选裁判、没有无命令的项、或驱动没告诉裁判在哪,都不追加', () => {
  assert.equal(judgeCommandOf(record({ judge: 'none' }), options), null)
  assert.equal(judgeCommandOf(record(), {}), null)
  assert.equal(
    judgeCommandOf(
      record({ criteria: [{ id: 'c1', description: 'x', command: 'true' }] }),
      options
    ),
    null
  )
  // 老记录没有 judge 字段:当 none
  assert.equal(judgeCommandOf(record({ judge: undefined }), options), null)
})

test('reload 套用记录时同样带上裁判命令;Windows 用双引号', () => {
  const goal = { objective: '旧', specRevision: 1, acceptance: null, falseClaims: 1 }
  const applied = applyRecordToGoal(goal, record(), options)
  assert.equal(applied.acceptance.commands.length, 3)
  assert.equal(applied.falseClaims, 0)
  assert.equal(quoteForShell('C:\\Users\\me\\x.js', 'win32'), '"C:\\Users\\me\\x.js"')
  assert.equal(quoteForShell("it's", 'linux'), "'it'\\''s'")
})
