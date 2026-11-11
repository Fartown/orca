// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type * as DispatchCandidates from '@/local-tasks/local-task-dispatch-candidates'

type CandidateFixture = {
  kind: 'workspace'
  id: string
  label: string
  detail: string
  hostId: string
  available: boolean
  worktree: { id: string; repoId: string }
}

const mocks = vi.hoisted(() => {
  const candidates: CandidateFixture[] = []
  return {
    app: { settings: { activeRuntimeEnvironmentId: 'server-a' }, repos: [] },
    candidates,
    dispatchBatch: vi.fn()
  }
})

vi.mock('@/store', () => ({
  useAppStore: (select: (state: typeof mocks.app) => unknown) => select(mocks.app)
}))
vi.mock('@/components/sidebar/sidebar-host-options', () => ({
  buildSidebarHostOptionsForAllHosts: () => []
}))
vi.mock('@/local-tasks/local-task-dispatch-candidates', async (importOriginal) => ({
  ...(await importOriginal<typeof DispatchCandidates>()),
  localTaskDispatchCandidates: () => mocks.candidates
}))
vi.mock('@/local-tasks/local-task-dispatch-project', () => ({
  projectsForDispatchTarget: () => [{ id: 'project', name: 'Project' }],
  createDispatchProjectForRepo: vi.fn()
}))
vi.mock('@/local-tasks/local-task-dispatch-multiple', () => ({
  dispatchLocalTaskToWorkspaces: mocks.dispatchBatch
}))
vi.mock('@/local-tasks/local-task-dispatch-launch', () => ({ dispatchLocalTask: vi.fn() }))
vi.mock('@/local-tasks/local-task-dispatch-focus', () => ({
  useLocalTaskDispatchFocusRequest: () => 0
}))
vi.mock('@/local-tasks/local-task-dispatch-undo', () => ({
  offerLocalTaskDispatchUndo: vi.fn(),
  offerLocalTaskDispatchBatchUndo: vi.fn()
}))
vi.mock('@/local-tasks/local-tasks-domain-store', () => ({
  useLocalTasksDomain: (select: (state: unknown) => unknown) =>
    select({ tasks: [], projects: [], links: { workspaces: [], sessions: [] }, preferences: {} }),
  useWritableLocalTaskEndpoints: () => []
}))
vi.mock('@/local-tasks/local-tasks-runtime-client', () => ({
  localTasksClient: { setPreference: vi.fn() }
}))
vi.mock('@/lib/agent-catalog', () => ({ getAgentCatalog: () => [{ id: 'claude' }] }))
vi.mock('../../../../shared/tui-agent-selection', () => ({
  pickTuiAgent: () => 'claude',
  filterEnabledTuiAgents: (ids: string[]) => ids
}))
vi.mock('@/components/agent/AgentCombobox', () => ({ default: () => null }))
vi.mock('@/components/pull-request-page/mentions/query', () => ({
  findMentionQuery: (text: string) => (text === '@' ? { atIndex: 0, query: '' } : null)
}))
vi.mock('./LocalTaskDispatchReceipt', () => ({ LocalTaskDispatchReceipt: () => null }))

import { LocalTaskDispatchBox } from './LocalTaskDispatchBox'

beforeEach(() => {
  mocks.app.settings.activeRuntimeEnvironmentId = 'server-a'
  mocks.candidates = Array.from({ length: 60 }, (_, index) => ({
    kind: 'workspace' as const,
    id: `workspace:remote:${index}`,
    label: `Workspace ${index}`,
    detail: 'Remote',
    hostId: 'ssh:remote',
    available: true,
    worktree: { id: `worktree-${index}`, repoId: 'repo' }
  }))
  mocks.dispatchBatch.mockReset().mockResolvedValue({ receipts: [], message: null })
})
afterEach(cleanup)

it('bounds selected chips while dispatching every selected workspace across active-server changes', async () => {
  const view = render(<LocalTaskDispatchBox />)
  const input = screen.getByRole('textbox', { name: 'Dispatch a task' })
  for (let index = 0; index < 60; index += 1) {
    fireEvent.change(input, { target: { value: '@', selectionStart: 1 } })
    fireEvent.click(screen.getByText(`Workspace ${index}`))
  }
  expect(screen.getByText('60 selected')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Workspace 59' })).toBeNull()
  expect(screen.getByText('10 more selected')).toBeTruthy()

  mocks.app.settings.activeRuntimeEnvironmentId = 'server-b'
  view.rerender(<LocalTaskDispatchBox />)
  fireEvent.change(input, { target: { value: 'Build the feature' } })
  fireEvent.click(screen.getByRole('button', { name: 'Dispatch' }))
  await waitFor(() => expect(mocks.dispatchBatch).toHaveBeenCalledOnce())
  expect(mocks.dispatchBatch.mock.calls[0]?.[0].targets).toHaveLength(60)
  expect(mocks.dispatchBatch.mock.calls[0]?.[0].targets[59].worktree.id).toBe('worktree-59')
})

it('greys Dispatch out when a picked workspace host drops after the pick', () => {
  const view = render(<LocalTaskDispatchBox />)
  const input = screen.getByRole('textbox', { name: 'Dispatch a task' })
  fireEvent.change(input, { target: { value: '@', selectionStart: 1 } })
  fireEvent.click(screen.getByText('Workspace 0'))
  fireEvent.change(input, { target: { value: 'Build the feature' } })
  const send = (): HTMLButtonElement => {
    const button = screen.getByRole('button', { name: 'Dispatch' })
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Dispatch is not a button')
    }
    return button
  }
  expect(send().disabled).toBe(false)

  mocks.candidates = mocks.candidates.map((candidate) => ({ ...candidate, available: false }))
  mocks.app = { ...mocks.app }
  view.rerender(<LocalTaskDispatchBox />)
  expect(send().disabled).toBe(true)
})
