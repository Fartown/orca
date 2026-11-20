// 守卫结论只校验格式:五个字段、都是字符串、decision 取值与组合约束。
import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGuardVerdict } from './guard-verdict.mjs'

const block = (value) => `核对过程……\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``
const full = (over = {}) => ({
  decision: 'instruct',
  observation: '看到的',
  instruction: '去改 src/a.ts',
  question: '',
  note: 'AUTH-01:没做到',
  ...over
})

test('合格的结论原样取出(去掉首尾空白)', () => {
  const parsed = parseGuardVerdict(block(full({ observation: '  看到的 ' })))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.verdict.observation, '看到的')
  assert.equal(parsed.verdict.decision, 'instruct')
})

test('取最后一个带 decision 的代码块;前面引用的示例不算', () => {
  const text = `${block(full({ instruction: '示例' }))}\n${block(full({ instruction: '真的' }))}`
  assert.equal(parseGuardVerdict(text).verdict.instruction, '真的')
})

test('裸 json 不算:必须放在代码块里', () => {
  assert.equal(parseGuardVerdict(JSON.stringify(full())).ok, false)
})

test('缺字段、非字符串、null 都判不合格,并说清是哪个', () => {
  const { note: _n, ...missing } = full()
  assert.match(parseGuardVerdict(block(missing)).error, /缺少字段:note/)
  assert.match(parseGuardVerdict(block(full({ question: null }))).error, /不是字符串:question/)
  assert.match(parseGuardVerdict(block(full({ decision: 'continue' }))).error, /decision 只能是/)
})

test('组合约束:instruct 要有指示;wait/done 不能有;ask_user 要有问题;done 不能有问题', () => {
  assert.match(parseGuardVerdict(block(full({ instruction: ' ' }))).error, /instruction 不能为空/)
  assert.match(
    parseGuardVerdict(block(full({ decision: 'wait' }))).error,
    /wait 时 instruction 必须是空字符串/
  )
  assert.match(
    parseGuardVerdict(block(full({ decision: 'ask_user', instruction: '' }))).error,
    /question 不能为空/
  )
  assert.match(
    parseGuardVerdict(block(full({ decision: 'done', instruction: '', question: '还有问题' })))
      .error,
    /done 时 question 必须是空字符串/
  )
})

test('wait 和 instruct 可以保留待答问题;ask_user 可以同时安排能做的事', () => {
  assert.equal(
    parseGuardVerdict(block(full({ decision: 'wait', instruction: '', question: 'Q' }))).ok,
    true
  )
  assert.equal(parseGuardVerdict(block(full({ question: 'Q' }))).ok, true)
  assert.equal(parseGuardVerdict(block(full({ decision: 'ask_user', question: 'Q' }))).ok, true)
})

test('confirmBox 可选:旧输出没有这个字段照样合法,取值为空', () => {
  const parsed = parseGuardVerdict(block(full()))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.verdict.confirmBox, '')
  assert.equal(parseGuardVerdict(block(full({ confirmBox: ' ' }))).verdict.confirmBox, '')
})

test('confirmBox 取 approve 或 reject;reject 必须带 instruct,approve 只配 wait 或 instruct', () => {
  assert.equal(
    parseGuardVerdict(block(full({ confirmBox: 'reject' }))).verdict.confirmBox,
    'reject'
  )
  const waitApprove = full({ decision: 'wait', instruction: '', confirmBox: 'approve' })
  assert.equal(parseGuardVerdict(block(waitApprove)).verdict.confirmBox, 'approve')
  assert.match(parseGuardVerdict(block(full({ confirmBox: 'yes' }))).error, /confirmBox 只能是/)
  assert.match(parseGuardVerdict(block(full({ confirmBox: 1 }))).error, /confirmBox 的值不是字符串/)
  const waitReject = full({ decision: 'wait', instruction: '', confirmBox: 'reject' })
  assert.match(parseGuardVerdict(block(waitReject)).error, /reject 时 decision 必须是 instruct/)
  const askApprove = full({ decision: 'ask_user', question: '要什么', confirmBox: 'approve' })
  assert.match(parseGuardVerdict(block(askApprove)).error, /approve 时 decision 只能是/)
})
