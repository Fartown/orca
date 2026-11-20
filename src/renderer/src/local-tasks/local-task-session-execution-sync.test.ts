// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { UNRESOLVED_OWNER_HOST_ID } from '../../../shared/execution-host/execution-host'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { bindLocalTaskSessionExecutions } from './local-task-session-execution-sync'

const INSTALLATION = '11111111-1111-4111-8111-111111111111'
const source: LocalTaskSessionLink = {
  id: 'runtime:mini/session',
  taskId: 'runtime:mini/task',
  hostId: `foreign:${INSTALLATION}/local`,
  executionOrigin: { installationId: INSTALLATION, hostId: 'local', hostLabel: 'Source Mac' },
  worktreeId: 'folder:source',
  instanceId: null,
  surface: 'terminal',
  tabId: 'source-tab',
  paneKey: 'source-tab:22222222-2222-4222-8222-222222222222',
  sessionId: null,
  providerSession: null,
  agent: 'codex',
  linkedVia: 'manual',
  openedAt: 1
}
let stop: (() => void) | undefined

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState(), true)
  const store = localTasksDomainStore.getState()
  store.openEndpoint('local')
  store.openEndpoint('runtime:mini')
  store.writer('runtime:mini').applyLinks({ workspaces: [], sessions: [source] })
})

afterEach(() => {
  stop?.()
  stop = undefined
  vi.restoreAllMocks()
})

it('resolves a source learned after its remote task link without refetching or double mirroring', () => {
  stop = bindLocalTaskSessionExecutions()
  expect(localTasksDomainStore.getState().links.sessions[0].hostId).toBe(UNRESOLVED_OWNER_HOST_ID)
  localTasksDomainStore.getState().writer('local').applyStatus({
    taskHost: true,
    state: 'ready',
    reason: null,
    revision: 0,
    taskHostId: 'library',
    installationId: INSTALLATION
  })
  let linked = localTasksDomainStore.getState().links.sessions[0]
  expect(linked).toMatchObject({ hostId: 'local', tabId: source.tabId, paneKey: source.paneKey })
  localTasksDomainStore.getState().refreshSessionExecutions()
  linked = localTasksDomainStore.getState().links.sessions[0]
  expect(linked.tabId).toBe(source.tabId)
  expect(localTasksDomainStore.getState().partitions[1].links.sessions[0]).toBe(source)
  expect(localTasksDomainStore.getState().progress?.sessions.get(source.id)?.state).toBe('unknown')
})

it('does not make the task-library host the execution owner when identity disappears', () => {
  stop = bindLocalTaskSessionExecutions()
  const writer = localTasksDomainStore.getState().writer('local')
  writer.applyStatus({
    taskHost: true,
    state: 'ready',
    reason: null,
    revision: 0,
    taskHostId: 'library',
    installationId: INSTALLATION
  })
  writer.applyStatus({
    taskHost: true,
    state: 'ready',
    reason: null,
    revision: 0,
    taskHostId: 'library'
  })
  const domain = localTasksDomainStore.getState()
  expect(domain.links.sessions[0].hostId).toBe(UNRESOLVED_OWNER_HOST_ID)
  expect(domain.progress?.sessions.get(source.id)?.state).toBe('unverifiable')
  expect(domain.partitions[1].links.sessions[0].paneKey).toBe(source.paneKey)
})
