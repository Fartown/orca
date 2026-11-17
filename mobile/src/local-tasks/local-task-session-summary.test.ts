import { expect, it } from 'vitest'
import { localTaskSessionSummary } from './local-task-session-summary'

it('keeps link labels, inline code and emphasis as one readable session line', () => {
  expect(
    localTaskSessionSummary(
      'Read [the report](https://example.com/report) and `run tests` **today**.'
    )
  ).toBe('Read the report and run tests today.')
})

it('separates Markdown list items while keeping their links and inline code', () => {
  expect(
    localTaskSessionSummary(
      '- [修复入口](https://example.com/entry) 已完成\n- 用 `pnpm test` 验证 [回归用例](https://example.com/cases)'
    )
  ).toBe('修复入口 已完成 用 pnpm test 验证 回归用例')
})

it('joins blocks and bounds long session text without splitting a Unicode character', () => {
  const summary = localTaskSessionSummary(`# Summary\n\n${'🙂'.repeat(200)}`)
  expect(summary.startsWith('Summary 🙂')).toBe(true)
  expect(summary.endsWith('…')).toBe(true)
  expect(Array.from(summary)).toHaveLength(161)
})
