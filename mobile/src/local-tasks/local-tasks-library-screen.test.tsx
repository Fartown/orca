import { createElement, useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { SELF_LOCAL_TASK_ENDPOINT, type LocalTaskSite } from './local-task-endpoint'
import { createLocalTasksApi } from './local-tasks-api'
import type { LocalTasksLibrary } from './use-local-tasks-library'

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles }
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 })
}))
vi.mock('lucide-react-native', () => ({ Plus: 'Plus' }))
vi.mock('../components/MobileSegmentedControl', () => ({ MobileSegmentedControl: () => null }))
vi.mock('../components/PickerListDrawer', () => ({ PickerListDrawer: () => null }))
vi.mock('../navigation/use-back-claim', () => ({ useBackClaim: () => {} }))
vi.mock('./local-task-view-memory', () => ({
  useLocalTaskViewMemory: () => [{ projectId: null, segment: 'all', view: 'list' }, () => {}]
}))
vi.mock('./use-orca-project-choices', () => ({ useOrcaProjectChoices: () => [] }))
vi.mock('./use-local-tasks-library-model', () => ({
  useLocalTasksLibraryModel: () => ({
    lookup: new Map(),
    counts: { started: 0, all: 0 },
    inContact: true,
    attentionRows: [],
    groups: [],
    listBand: null,
    cards: { connected: new Map(), context: { hostName: () => '' } },
    tasksById: new Map(),
    sessionsFor: () => [],
    factsFor: () => null,
    latestLineFor: () => null
  })
}))
vi.mock('./local-task-dispatch-input', () => ({ LocalTaskDispatchInput: () => null }))
vi.mock('./local-task-form-view', () => ({ LocalTaskFormView: () => null }))
vi.mock('./local-tasks-filter-bar', () => ({ LocalTasksFilterBar: () => null }))
vi.mock('./local-tasks-board-view', () => ({ LocalTasksBoardView: () => null }))
vi.mock('./local-tasks-library-header', () => ({ LocalTasksLibraryHeader: () => null }))
vi.mock('./local-tasks-list-view', () => ({ LocalTasksListView: () => null }))
vi.mock('./local-tasks-attention-view', () => ({ LocalTasksAttentionView: () => null }))
vi.mock('./local-task-needs-you-list', () => ({ LocalTaskNeedsYouList: () => null }))
vi.mock('./local-task-preview-drawer', () => ({ LocalTaskPreviewDrawer: () => null }))
vi.mock('./local-tasks-project-create-view', () => ({ LocalTasksProjectCreateView: () => null }))
vi.mock('./local-tasks-settings-view', () => ({ LocalTasksSettingsView: () => null }))
vi.mock('./local-tasks-styles', () => ({ localTaskStyles: {} }))
// A task page that holds a draft, as the real one holds comment edits and a send-back reason.
vi.mock('./local-task-detail-view', () => ({
  LocalTaskDetailView: (props: { taskId: string; onOpenTask: (taskId: string) => void }) => {
    const [draft, setDraft] = useState('')
    return createElement('detail', {
      taskId: props.taskId,
      draft,
      type: setDraft,
      openSubtask: props.onOpenTask
    })
  }
}))

import { LocalTasksLibraryScreen } from './local-tasks-library-screen'

const client: RpcClient = {
  sendRequest: async () => ({ id: 'test', ok: true, result: {} }),
  subscribe: () => () => {},
  updateTerminalSubscriptionViewport: () => {},
  getState: () => 'connected',
  getReconnectAttempt: () => 0,
  getLastConnectedAt: () => null,
  onStateChange: () => () => {},
  notifyForeground: () => {},
  close: () => {}
}
const site: LocalTaskSite = {
  hostId: 'host-1',
  pairedClient: client,
  client,
  endpoint: SELF_LOCAL_TASK_ENDPOINT,
  connState: 'connected',
  capabilities: [],
  label: 'Desktop'
}
const library = {
  api: null,
  tasks: [],
  projects: [],
  status: null,
  loaded: true,
  error: null,
  eventsVersion: 0,
  live: true,
  streamEnded: false,
  work: { links: { workspaces: [], sessions: [] }, progress: null, error: null },
  acceptTasks: () => {},
  reload: () => {},
  retryFailed: () => {},
  resubscribe: () => {}
} satisfies LocalTasksLibrary

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

function detail() {
  const node = renderer?.root.find((entry) => String(entry.type) === 'detail')
  if (!node) {
    throw new Error('no task page')
  }
  return node.props
}

describe('the library page opening one task from another', () => {
  it("leaves the first task's unsent draft behind", async () => {
    await act(async () => {
      renderer = create(
        createElement(LocalTasksLibraryScreen, {
          site,
          hosts: [],
          onSwitchHost: () => {},
          api: createLocalTasksApi(client),
          library,
          readOnly: false,
          canRead: true,
          onExit: () => {},
          onNavigate: () => {},
          initialTaskId: 'parent'
        })
      )
    })
    await act(async () => detail().type('Not this way: keep the old API'))
    expect(detail().draft).toBe('Not this way: keep the old API')

    await act(async () => detail().openSubtask('child'))
    expect(detail().taskId).toBe('child')
    expect(detail().draft).toBe('')
  })
})
