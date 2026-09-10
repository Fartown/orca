import { describe, expect, it } from 'vitest'
import { composeGoalAcceptanceText, judgeRunsWholeGoal } from './goal-judge-contract'
import { GoalSpecSchema } from './goal-control-contract'

const criterion = (id: string, command?: string) => ({
  id,
  description: `做完 ${id}`,
  ...(command ? { command } : {})
})

describe('judgeRunsWholeGoal', () => {
  it('is false for every criteria shape when no judge is picked', () => {
    for (const criteria of [[], [criterion('a')], [criterion('a', 'true')]]) {
      expect(judgeRunsWholeGoal({ judge: 'none', criteria })).toBe(false)
    }
    // An older record parsed before the field existed reads as none, never as a judge.
    expect(judgeRunsWholeGoal({ judge: undefined as never, criteria: [] })).toBe(false)
  })

  it('is true when a judge has nothing left to judge item by item', () => {
    expect(judgeRunsWholeGoal({ judge: 'codex', criteria: [] })).toBe(true)
    expect(judgeRunsWholeGoal({ judge: 'claude', criteria: [criterion('a', 'pnpm test')] })).toBe(
      true
    )
  })

  it('is false while any criterion still lacks a command', () => {
    expect(
      judgeRunsWholeGoal({
        judge: 'codex',
        criteria: [criterion('a', 'pnpm test'), criterion('b')]
      })
    ).toBe(false)
  })
})

describe('composeGoalAcceptanceText', () => {
  const spec = (over: Partial<Parameters<typeof composeGoalAcceptanceText>[0]> = {}) => ({
    objective: '  完成核查  ',
    criteria: [],
    acceptanceText: '',
    ...over
  })

  it('is the trimmed objective when nothing else is declared', () => {
    expect(composeGoalAcceptanceText(spec())).toBe('完成核查')
  })

  it('numbers the criteria and appends the acceptance notes', () => {
    expect(
      composeGoalAcceptanceText(
        spec({ criteria: [criterion('a'), criterion('b', 'true')], acceptanceText: '  说明  ' })
      )
    ).toBe('完成核查\n\n验收标准:\n1. 做完 a\n2. 做完 b\n\n说明')
  })

  it('omits an empty notes block instead of leaving a trailing gap', () => {
    expect(composeGoalAcceptanceText(spec({ acceptanceText: '   ' }))).toBe('完成核查')
  })
})

it('uses the reviewed document verbatim for execution and whole-goal judging', () => {
  const spec = {
    objective: '旧目标',
    criteria: [criterion('legacy')],
    acceptanceText: '旧说明',
    acceptanceDocument: '    保留 Markdown 缩进。\n\n# 审阅稿\n\n具体标准\n',
    judge: 'codex' as const
  }
  expect(composeGoalAcceptanceText(spec)).toBe(spec.acceptanceDocument)
  expect(judgeRunsWholeGoal(spec)).toBe(true)
})

it('validates document content without normalizing its Markdown whitespace', () => {
  const schema = GoalSpecSchema.shape.acceptanceDocument
  const document = '    这是一段缩进代码。\n\n# 验收文档\n'
  expect(schema.parse(document)).toBe(document)
  expect(schema.safeParse(' \t\r\n').success).toBe(false)
  expect(schema.safeParse('x'.repeat(32_001)).success).toBe(false)
  expect(schema.parse(undefined)).toBeUndefined()
})
