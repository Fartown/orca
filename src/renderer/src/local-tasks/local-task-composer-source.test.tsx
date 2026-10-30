// @vitest-environment happy-dom
import { useState, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>
}))
vi.mock('@/runtime/runtime-linear-client', () => ({
  linearStatus: vi.fn(async () => ({ connected: false, viewer: null }))
}))
const toastInfo = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { info: toastInfo, error: vi.fn(), success: vi.fn() } }))

import { useAppStore } from '@/store'
import SmartWorkspaceNameField from '@/components/new-workspace/SmartWorkspaceNameField'
import type { SmartWorkspaceNameSelection } from '@/components/new-workspace/smart-workspace-name-field-model'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTaskLibraryViewerStore } from './local-task-library-viewers'
import { LocalTaskSourceTabContext, type LocalTaskSourceTab } from './local-task-source-tab'
import { localTaskIdForCreation, resetLocalTaskStartWorkForTests } from './local-task-start-work'
import { useLocalTaskComposerSource } from './use-local-task-composer-source'

const initialState = useAppStore.getInitialState()
const project: LocalTaskProject = {
  id: 'shop',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: [],
  repos: ['orca-shop'],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [],
  createdAt: 0,
  updatedAt: 0,
  revision: 1
}
const task: LocalTask = {
  id: 't12',
  projectId: 'shop',
  number: 12,
  ref: 'SHOP-12',
  title: 'Order export',
  description: 'CSV of last month',
  criteria: [],
  statusId: 'todo',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 1
}
const repo = { id: 'repo1', path: '/repo1', displayName: 'Shop', badgeColor: '', addedAt: 1 }

function card(overrides: Partial<Parameters<typeof useLocalTaskComposerSource>[1]> = {}) {
  return {
    name: '',
    onNameValueChange: vi.fn(),
    onClearSmartNameSelection: vi.fn(),
    selectedRepoExecutionHostId: 'ssh:minizc' as const,
    selectedRepoProjectId: 'orca-shop',
    selectedRepoIsGit: true,
    ...overrides
  }
}

beforeEach(() => {
  useAppStore.setState(initialState, true)
  useAppStore.setState({
    fetchWorkItems: vi.fn(async () => []),
    getCachedWorkItems: vi.fn(() => []),
    refreshPreflightStatus: vi.fn(async () => {}),
    checkLinearConnection: vi.fn(async () => {}),
    readJiraStatus: vi.fn(async () => ({ connected: false, viewer: null, sites: [] })),
    linearStatusChecked: true,
    repos: [repo]
  })
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  const domain = localTasksDomainStore.getState()
  domain.openEndpoint('local')
  const writer = domain.writer('local')
  writer.setConnection('live')
  writer.setHostState('ready', null)
  writer.applyProjects([project])
  writer.applyTasks([task])
  writer.applyLinks({ workspaces: [], sessions: [] })
  Element.prototype.scrollIntoView = vi.fn()
  resetLocalTaskStartWorkForTests()
})
afterEach(cleanup)

describe('the composer’s Local tasks pick (REQ-009)', () => {
  it('names the workspace after the picked task and shows it as the source pill', () => {
    const fields = card({ name: 'export' })
    const { result } = renderHook(() => useLocalTaskComposerSource(undefined, fields))
    act(() => result.current.tab?.select(task))
    expect(fields.onClearSmartNameSelection).toHaveBeenCalledOnce()
    expect(fields.onNameValueChange).toHaveBeenCalledWith('shop-12-order-export')
    expect(result.current.cardOverrides).toMatchObject({
      smartNameSelection: { kind: 'local-task', label: 'Order export' }
    })
    expect(result.current.tab).toMatchObject({ hostId: 'ssh:minizc', selectedTaskId: 't12' })
  })

  it('clears the name it chose along with the pill, but keeps a name the user typed', () => {
    const start = { taskId: 't12', orcaProjectIds: ['orca-shop'], replace: false }
    const auto = card({ name: 'shop-12-order-export' })
    const first = renderHook(() => useLocalTaskComposerSource(start, auto))
    act(() => first.result.current.cardOverrides.onClearSmartNameSelection?.())
    expect(auto.onNameValueChange).toHaveBeenCalledWith('')
    expect(first.result.current.cardOverrides).toEqual({})
    const typed = card({ name: 'my own name' })
    const second = renderHook(() => useLocalTaskComposerSource(start, typed))
    act(() => second.result.current.cardOverrides.onClearSmartNameSelection?.())
    expect(typed.onNameValueChange).not.toHaveBeenCalled()
  })

  it('hands the task to the creation as a draft prompt and keeps only the first workspace', () => {
    const start = { taskId: 't12', orcaProjectIds: ['orca-shop'], replace: true }
    const { result } = renderHook(() => useLocalTaskComposerSource(start, card()))
    const options = result.current.submitOptions()
    expect(options.launchPrompt).toContain('Order export')
    expect(options.launchPrompt).toContain('CSV of last month')
    act(() => options.onCreationStarted?.('creation-1'))
    expect(localTaskIdForCreation('creation-1')).toBe('t12')
    expect(result.current.cardOverrides).toEqual({})
    expect(result.current.submitOptions()).toEqual({})
  })

  it('sets the pick aside, saying why, on a target served by another Orca or a folder', () => {
    const start = { taskId: 't12', orcaProjectIds: [], replace: false }
    toastInfo.mockClear()
    const paired = renderHook(() =>
      useLocalTaskComposerSource(start, card({ selectedRepoExecutionHostId: 'runtime:env-1' }))
    )
    expect(paired.result.current.cardOverrides).toEqual({})
    expect(paired.result.current.submitOptions()).toEqual({})
    expect(toastInfo).toHaveBeenLastCalledWith(
      expect.stringMatching(/^“Order export” is kept on .+, so it can’t start work on this host\./)
    )
    const folder = renderHook(() =>
      useLocalTaskComposerSource(start, card({ selectedRepoIsGit: false }))
    )
    expect(folder.result.current.tab).toBeNull()
    expect(toastInfo).toHaveBeenLastCalledWith(
      'A folder can’t start work on “Order export”, so the task is set aside. Switch back to a Git repository to keep it.'
    )
    expect(toastInfo).toHaveBeenCalledTimes(2)
  })
})

function Field({
  tab,
  selectedSource = null,
  initialValue = ''
}: {
  tab: LocalTaskSourceTab
  selectedSource?: SmartWorkspaceNameSelection | null
  initialValue?: string
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <LocalTaskSourceTabContext.Provider value={tab}>
      <SmartWorkspaceNameField
        repos={[repo]}
        selectedRepo={repo}
        repoId="repo1"
        onRepoChange={vi.fn()}
        value={value}
        onValueChange={setValue}
        onGitHubItemSelect={vi.fn()}
        onBranchSelect={vi.fn()}
        onLinearIssueSelect={vi.fn()}
        selectedSource={selectedSource}
        onClearSelectedSource={vi.fn()}
      />
    </LocalTaskSourceTabContext.Provider>
  )
}

function composerTab(overrides: Partial<LocalTaskSourceTab> = {}): LocalTaskSourceTab {
  return {
    hostId: 'local',
    orcaProjectIds: ['orca-shop'],
    workspace: null,
    libraryLabel: 'This Mac',
    selectedTaskId: null,
    initialMode: false,
    select: vi.fn(),
    ...overrides
  }
}

describe('the composer’s Create From field shares the Local tasks tab', () => {
  it('lists tasks on the tab after Smart and hands the chosen one to the composer', async () => {
    const tab = composerTab()
    render(<Field tab={tab} />)
    const tabs = screen.getAllByRole('tab').map((candidate) => candidate.textContent)
    expect(tabs.indexOf('Local')).toBe(tabs.indexOf('Smart') + 1)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Local' }))
    fireEvent.click(await screen.findByRole('option', { name: /Order export/ }))
    expect(tab.select).toHaveBeenCalledWith(task)
  })

  it('asks paired libraries for their projects while the field is open', () => {
    const view = render(<Field tab={composerTab()} />)
    expect(localTaskLibraryViewerStore.getState().viewers).toBe(1)
    view.unmount()
    expect(localTaskLibraryViewerStore.getState().viewers).toBe(0)
  })

  it('still lists tasks when the name in the box is one a set-aside pick wrote', async () => {
    const tab = composerTab({ pickedName: 'shop-12-order-export' })
    render(<Field tab={tab} initialValue="shop-12-order-export" />)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Local' }))
    expect(await screen.findByRole('option', { name: /Order export/ })).toBeTruthy()
  })

  it('shows a picked task’s title in the pill with its ref beside it', () => {
    render(
      <Field
        tab={composerTab({ selectedTaskId: 't12' })}
        selectedSource={{ kind: 'local-task', label: 'Order export' }}
      />
    )
    const pill = document.querySelector('[data-workspace-source-pill="true"]')
    expect(pill?.textContent).toContain('SHOP-12')
    expect(pill?.textContent).toContain('Order export')
  })
})
