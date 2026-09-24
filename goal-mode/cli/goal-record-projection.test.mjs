// 宿主记录 → 驱动字段:目标原文还给执行 agent,清单另给路径;守卫就是选的那个 agent;
// 用户配置的检查命令只在守卫判完成后跑,不再混进一条裁判命令。
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acceptanceOf,
  applyRecordToGoal,
  checklistPathOf,
  guardOf,
  objectiveOf,
  quoteForShell
} from './goal-record-projection.mjs'

const record = (spec = {}, budget = {}) => ({
  goalId: 'g',
  specRevision: 2,
  workspace: { path: '/tmp/my repo' },
  binding: { terminal: 'term_1' },
  budget: { maxTurns: 3, maxMinutes: 0, checkTimeoutSeconds: 120, ...budget },
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
  criteriaPath: '/home/u/.orca-goal/v2/goals/g/judge-criteria.md',
  guardLogDir: '/home/u/.orca-goal/v2/goals/g/guard'
}

test('检查命令只有用户配置的那些,不再追加裁判命令', () => {
  const acceptance = acceptanceOf(record())
  assert.deepEqual(acceptance.commands, ['pnpm test', 'pnpm lint'])
  assert.equal(acceptance.timeoutMs, 120_000)
  assert.deepEqual(acceptanceOf(record({ criteria: [], extraChecks: [] })).commands, [])
})

test('执行 agent 和守卫拿到的是用户写的目标原文,验收文档不再顶替它', () => {
  assert.equal(objectiveOf(record()), '目标')
  assert.equal(objectiveOf(record({ acceptanceDocument: '# 很长的验收文档' })), '目标')
})

test('守卫就是选的那个 agent;旧目标的 judge: none 没有守卫', () => {
  assert.deepEqual(guardOf(record(), options), {
    agent: 'claude',
    timeoutMs: 10 * 60_000,
    logDir: options.guardLogDir
  })
  assert.equal(guardOf(record({ judge: 'none' }), options).agent, null)
  assert.equal(guardOf(record({ judge: undefined }), options).agent, null)
  assert.equal(guardOf(record({}, { checkTimeoutSeconds: 1800 }), options).timeoutMs, 1_800_000)
})

test('清单路径只在有清单可读时给出', () => {
  assert.equal(checklistPathOf(record(), options), options.criteriaPath)
  assert.equal(
    checklistPathOf(record({ criteria: [], acceptanceDocument: '# 清单' }), options),
    options.criteriaPath
  )
  assert.equal(checklistPathOf(record({ criteria: [], acceptanceText: '  ' }), options), null)
})

test('reload 套用记录:版本变了清掉旧的验收结果;Windows 用双引号', () => {
  const goal = { objective: '旧', specRevision: 1, acceptance: null, lastAcceptance: { x: 1 } }
  const applied = applyRecordToGoal(goal, record(), options)
  assert.equal(applied.objective, '目标')
  assert.equal(applied.guard.agent, 'claude')
  assert.equal(applied.checklistPath, options.criteriaPath)
  assert.equal(applied.lastAcceptance, null)
  const same = applyRecordToGoal({ ...goal, specRevision: 2 }, record(), options)
  assert.deepEqual(same.lastAcceptance, { x: 1 })
  assert.equal(quoteForShell('C:\\Users\\me\\x.js', 'win32'), '"C:\\Users\\me\\x.js"')
  assert.equal(quoteForShell("it's", 'linux'), "'it'\\''s'")
})
