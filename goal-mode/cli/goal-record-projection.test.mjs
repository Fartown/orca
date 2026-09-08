// 宿主记录 → 驱动验收命令:选了裁判就一定追加一条裁判命令 —— 还有没带命令的验收项时走条目模式,
// 一条都没有时走整体文本模式。选了裁判却什么都不验,正是这次要堵掉的洞。
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acceptanceOf,
  applyRecordToGoal,
  judgeCommandOf,
  objectiveOf,
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
  criteriaPath: '/home/u/.orca-goal/v2/goals/g/judge-criteria.md',
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

test('每条验收项都带命令时改判整体:裁判仍然会跑,只是换成文本模式', () => {
  assert.equal(
    judgeCommandOf(
      record({ criteria: [{ id: 'c1', description: 'x', command: 'true' }] }),
      options
    ),
    "'/Applications/Orca.app/Contents/MacOS/Orca' '/app/goal-driver/acceptance-judge.js' --agent claude --cwd '/tmp/my repo' --criteria-file '/home/u/.orca-goal/v2/goals/g/judge-criteria.md' --timeout 120 --sandbox read-only"
  )
})

test('一条验收项都没有 —— 用户踩到的那种目标 —— 也一定有一条整体裁判命令', () => {
  const acceptance = acceptanceOf(record({ criteria: [], extraChecks: [] }), options)
  assert.equal(acceptance.commands.length, 1)
  assert.equal(
    acceptance.commands[0],
    "'/Applications/Orca.app/Contents/MacOS/Orca' '/app/goal-driver/acceptance-judge.js' --agent claude --cwd '/tmp/my repo' --criteria-file '/home/u/.orca-goal/v2/goals/g/judge-criteria.md' --timeout 120 --sandbox read-only"
  )
})

test('没选裁判、驱动没给入口、或没给对应输入路径时才不追加', () => {
  assert.equal(judgeCommandOf(record({ judge: 'none' }), options), null)
  // 老记录没有 judge 字段:当 none
  assert.equal(judgeCommandOf(record({ judge: undefined }), options), null)
  assert.equal(judgeCommandOf(record(), {}), null)
  // 整体模式缺 criteriaPath、条目模式缺 itemsPath:宁可不追加,也不发一条指向 undefined 的命令。
  const { criteriaPath: _c, ...noCriteria } = options
  assert.equal(judgeCommandOf(record({ criteria: [] }), noCriteria), null)
  const { itemsPath: _i, ...noItems } = options
  assert.equal(judgeCommandOf(record(), noItems), null)
})

test('注入给 agent 的目标正文和交给裁判的那份文本是同一份字节', () => {
  assert.equal(objectiveOf(record()), '目标\n\n验收标准:\n1. 测试通过\n2. 文档写了用法')
})

test('reload 套用记录时同样带上裁判命令;Windows 用双引号', () => {
  const goal = { objective: '旧', specRevision: 1, acceptance: null, falseClaims: 1 }
  const applied = applyRecordToGoal(goal, record(), options)
  assert.equal(applied.acceptance.commands.length, 3)
  assert.equal(applied.falseClaims, 0)
  assert.equal(quoteForShell('C:\\Users\\me\\x.js', 'win32'), '"C:\\Users\\me\\x.js"')
  assert.equal(quoteForShell("it's", 'linux'), "'it'\\''s'")
})
