// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { GoalSummary } from '../../../shared/goals/goal-control-contract'
import { GoalNoticeWatcher } from './GoalNoticeWatcher'

type NoticeRow = Pick<GoalSummary, 'goalId' | 'notices'> & { workspace: { path: string } }
const lists = new Map<string, () => Promise<{ items: NoticeRow[] }>>()
const routes: string[] = []

vi.mock('./goal-runtime-client', () => ({
  GoalRuntimeClient: class {
    constructor(readonly host: string) {
      routes.push(host)
    }
    list() {
      return (lists.get(this.host) ?? (async () => ({ items: [] })))()
    }
  }
}))
vi.mock('../store', () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({
      repos: [{ connectionId: null }, { connectionId: 'box' }],
      folderWorkspaces: [{ connectionId: 'box' }]
    })
}))

const dispatch = vi.fn()

function summary(notices: GoalSummary['notices']): NoticeRow {
  return { goalId: 'g1', workspace: { path: '/home/me/app' }, notices }
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  routes.length = 0
  lists.clear()
  dispatch.mockReset()
  dispatch.mockResolvedValue({ delivered: true })
  Object.assign(window, { api: { notifications: { dispatch } } })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('polls every execution host it knows, whichever workspace is open', async () => {
  render(<GoalNoticeWatcher />)
  await act(async () => {})
  expect(routes.sort()).toEqual(['local', 'ssh:box'])
})

it('shows each notice once, across polls and remounts', async () => {
  const notice = { id: 'question:1', kind: 'question', text: '需要验证码', at: 1 }
  lists.set('ssh:box', async () => ({ items: [summary([notice])] }))
  const view = render(<GoalNoticeWatcher />)
  await act(async () => {})
  expect(dispatch).toHaveBeenCalledTimes(1)
  expect(dispatch.mock.calls[0][0]).toMatchObject({
    source: 'agent-task-complete',
    agentState: 'waiting',
    worktreeLabel: 'app'
  })
  expect(dispatch.mock.calls[0][0].agentLastAssistantMessage).toContain('需要验证码')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000)
  })
  view.unmount()
  render(<GoalNoticeWatcher />)
  await act(async () => {})
  expect(dispatch).toHaveBeenCalledTimes(1)
})

it('retries a notice the burst cooldown swallowed, but not one the user turned off', async () => {
  lists.set('local', async () => ({
    items: [
      summary([
        { id: 'budget:1', kind: 'budget', text: '用完了', at: 1 },
        { id: 'complete:1', kind: 'complete', text: '做完了', at: 2 }
      ])
    ]
  }))
  dispatch
    .mockResolvedValueOnce({ delivered: false, reason: 'cooldown' })
    .mockResolvedValueOnce({ delivered: false, reason: 'source-disabled' })
  render(<GoalNoticeWatcher />)
  await act(async () => {})
  expect(dispatch).toHaveBeenCalledTimes(2)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000)
  })
  expect(dispatch).toHaveBeenCalledTimes(3)
  expect(dispatch.mock.calls[2][0].agentLastAssistantMessage).toContain('用完了')
})

it('treats an unreachable host as unverifiable: nothing is marked, the next poll tries again', async () => {
  const notice = { id: 'guard-unavailable:1', kind: 'guard-unavailable', text: 'x', at: 1 }
  let reachable = false
  lists.set('ssh:box', async () => {
    if (!reachable) {
      throw new Error('SSH connection lost')
    }
    return { items: [summary([notice])] }
  })
  render(<GoalNoticeWatcher />)
  await act(async () => {})
  expect(dispatch).not.toHaveBeenCalled()
  reachable = true
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000)
  })
  expect(dispatch).toHaveBeenCalledTimes(1)
})
