// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { GoalDetail, GoalEvidence } from '../../../../shared/goals/goal-control-contract'
import { GOAL_WHOLE_VERDICT_ID } from '../../../../shared/goals/goal-judge-contract'
import { GoalProgress } from './GoalProgress'

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function render(detail: GoalDetail): string {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(<GoalProgress detail={detail} />))
  return host.textContent ?? ''
}

const evidence = (over: Partial<GoalEvidence> = {}): GoalEvidence => ({
  id: 'run:1:0',
  runId: 'run',
  specRevision: 1,
  turn: 1,
  criterionId: null,
  status: 'passed',
  source: 'judge',
  artifactId: null,
  snapshotTree: null,
  summary: '',
  ...over
})

const detail = (over: Partial<GoalDetail['spec']> = {}, rows: GoalEvidence[] = []): GoalDetail =>
  ({
    specRevision: 1,
    spec: {
      objective: '完成核查',
      criteria: [],
      acceptanceText: '',
      extraChecks: [],
      checkAll: false,
      onBlocked: 'ask',
      judge: 'codex',
      ...over
    },
    evidence: rows
  }) as unknown as GoalDetail

describe('GoalProgress', () => {
  it('shows a whole-goal row before the judge has ruled, instead of "nothing to verify"', () => {
    const text = render(detail())
    expect(text).toContain('Whole-goal acceptance')
    expect(text).toContain('Not verified yet')
    expect(text).not.toContain('Nothing to verify')
    // No criteria means no per-criterion count to show.
    expect(text).not.toMatch(/\d+ of \d+ verified/)
  })

  it('falls back to "nothing to verify" when no judge is picked', () => {
    const text = render(detail({ judge: 'none' }))
    expect(text).toContain('Nothing to verify')
    expect(text).not.toContain('Whole-goal acceptance')
  })

  it('renders the whole verdict in full, not truncated to one line', () => {
    const text = render(
      detail({}, [
        evidence({ scope: 'goal', status: 'passed', summary: 'PASS\n证据: docs/usage.md:12' })
      ])
    )
    expect(text).toContain('Whole-goal acceptance')
    expect(text).toContain('Passed')
    expect(text).toContain('证据: docs/usage.md:12')
  })

  it('never lets the whole verdict be claimed as an extra check result', () => {
    const text = render(
      detail({ extraChecks: ['pnpm lint'], criteria: [] }, [
        evidence({ scope: 'goal', status: 'passed', summary: 'pnpm lint 也确认了' })
      ])
    )
    expect(text).toContain('Whole-goal acceptance')
    // The extra check has no command result of its own, so it stays unverified.
    expect(text).toContain('Check · Not verified yet')
  })

  it('drops a verdict from an older definition revision', () => {
    const text = render(
      detail({}, [evidence({ scope: 'goal', status: 'passed', specRevision: 0, summary: 'PASS' })])
    )
    expect(text).toContain('Whole-goal acceptance')
    expect(text).toContain('Not verified yet')
    expect(text).not.toContain('PASS')
  })

  it('keeps the per-criterion count blind to the whole-goal row', () => {
    const text = render(
      detail({ criteria: [{ id: 'c1', description: '首页可用', command: 'pnpm test' }] }, [
        evidence({ scope: 'goal', status: 'passed', summary: 'PASS' }),
        evidence({ id: `run:1:9:${GOAL_WHOLE_VERDICT_ID}` })
      ])
    )
    expect(text).toContain('0 of 1 verified')
  })
})
