import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTaskProposal } from '../../../shared/local-tasks/local-task-dispatcher-types'
import { toWebTerminalSurfaceTabId } from '../../../shared/workspace-layout/terminal-surface-id'
import type { LocalTaskEndpointKey } from './local-task-endpoints'

const fixture = vi.hoisted(() => {
  const source: { endpoint: LocalTaskEndpointKey } = { endpoint: 'runtime:mini' }
  return {
    ...source,
    call: vi.fn(),
    write: vi.fn(),
    partitions: [
      { endpoint: 'local' as const, installationId: '11111111-1111-4111-8111-111111111111' },
      { endpoint: 'runtime:mini' as const, installationId: '22222222-2222-4222-8222-222222222222' }
    ]
  }
})
vi.mock('./local-tasks-endpoint-calls', () => ({
  callLocalTasks: fixture.call,
  writeLocalTasks: fixture.write
}))
vi.mock('./local-tasks-domain-store', () => ({
  localTasksDomainStore: { getState: () => ({ partitions: fixture.partitions }) }
}))
vi.mock('./local-task-dispatcher-source', () => ({
  getLocalTaskDispatcherEndpoint: () => fixture.endpoint
}))
import {
  localTaskDispatcherClient,
  localTaskDispatcherClientFor
} from './local-task-dispatcher-client'
import {
  dispatcherClientProposalItem,
  dispatcherClientTaskId,
  dispatcherSourceTaskId,
  isResolvedDispatcherTaskId,
  dispatcherFactSourceId
} from './local-task-dispatcher-ids'

const LEAF = '33333333-3333-4333-8333-333333333333'
const proposal: LocalTaskProposal = {
  id: 'proposal',
  conversationId: 'conversation',
  summary: null,
  items: [{ kind: 'append', taskId: 'task', sessionLinkId: 'session', text: 'next' }],
  status: 'confirmed',
  keptItemIndexes: null,
  results: null,
  createdAt: 1,
  decidedAt: 1,
  decidedSource: 'desktop'
}
beforeEach(() => {
  fixture.endpoint = 'runtime:mini'
  fixture.call.mockReset()
  fixture.write.mockReset()
  fixture.write.mockResolvedValue({ ok: true, proposal })
})

describe('dispatcher client source authority', () => {
  it('removes an unresolved watch from its own source without treating the token as a host', async () => {
    fixture.write.mockResolvedValue({ ok: true })
    const token = 'runtime:dispatcher-missing/task'
    await localTaskDispatcherClientFor('runtime:mini').unwatch(`tab:${LEAF}`, token)
    expect(fixture.write.mock.calls[0].slice(0, 3)).toEqual([
      'runtime:mini',
      'localTasks.dispatcher.unwatch',
      { paneKey: `tab:${LEAF}`, taskId: token }
    ])
    fixture.write.mockClear()
    const legacy = dispatcherClientTaskId('runtime:mini', 'runtime:creator-peer/task')
    await localTaskDispatcherClientFor('runtime:mini').unwatch(`tab:${LEAF}`, legacy)
    expect(fixture.write.mock.calls[0][2].taskId).toBe('runtime:creator-peer/task')
  })
  it('keeps a proposal write on its owning library after the selected source changes', async () => {
    fixture.endpoint = 'local'
    const result = await localTaskDispatcherClient.claim('runtime:mini/proposal')
    expect(fixture.write.mock.calls[0].slice(0, 3)).toEqual([
      'runtime:mini',
      'localTasks.proposals.claim',
      { proposalId: 'proposal' }
    ])
    expect(result).toMatchObject({
      ok: true,
      proposal: {
        id: 'runtime:mini/proposal',
        conversationId: 'runtime:mini/conversation',
        items: [{ taskId: 'runtime:mini/task', sessionLinkId: 'runtime:mini/session' }]
      }
    })
  })

  it('registers the source raw pane for a per-leaf mirror and carries the ordinary folder workspace', async () => {
    fixture.write.mockResolvedValue({
      ok: true,
      conversation: {
        id: 'conversation',
        paneKey: `tab:${LEAF}`,
        agent: 'claude',
        createdAt: 1,
        updatedAt: 1
      }
    })
    const mirror = `${toWebTerminalSurfaceTabId(`tab::${LEAF}`)}:${LEAF}`
    await localTaskDispatcherClientFor('runtime:mini').register(
      mirror,
      'claude',
      null,
      'folder:source'
    )
    expect(fixture.write.mock.calls[0].slice(0, 3)).toEqual([
      'runtime:mini',
      'localTasks.dispatcher.register',
      { paneKey: `tab:${LEAF}`, agent: 'claude', worktreeId: 'folder:source' }
    ])
  })

  it('reports task ids in the proposal source perspective, never in the newly selected host', async () => {
    fixture.endpoint = 'local'
    await localTaskDispatcherClient.recordResults('runtime:mini/proposal', [
      { index: 0, ok: true, taskId: 'runtime:mini/native' },
      { index: 1, ok: true, taskId: 'local-task' }
    ])
    expect(fixture.write.mock.calls[0][2]).toEqual({
      proposalId: 'proposal',
      finalize: true,
      results: [
        { index: 0, ok: true, taskId: 'native' },
        {
          index: 1,
          ok: true,
          taskId: 'runtime:dispatcher-11111111-1111-4111-8111-111111111111/local-task'
        }
      ]
    })
  })

  it('reads only source dispatcher preferences and excludes the desktop host choice', async () => {
    fixture.call.mockResolvedValue({ values: { 'dispatcher.paneKey': null } })
    await localTaskDispatcherClientFor('runtime:mini').readPreferences()
    expect(fixture.call.mock.calls[0].slice(0, 3)).toEqual([
      'runtime:mini',
      'localTasks.preferences.get',
      { keys: ['dispatcher.paneKey', 'dispatcher.session.v1', 'dispatcher.wake'] }
    ])
  })
})

describe('dispatcher source-relative ids', () => {
  it('keeps forwarded event deduplication stable when another desktop names the same installation differently', () => {
    const original = dispatcherFactSourceId('runtime:mini/task', 'runtime:mini/event')
    const renamed = dispatcherFactSourceId('runtime:new-pair/task', 'runtime:new-pair/event', [
      { endpoint: 'runtime:new-pair', installationId: fixture.partitions[1].installationId }
    ])
    expect(renamed).toBe(original)
  })
  it('resolves an external installation token to this client independently of its source environment ids', () => {
    const token = dispatcherSourceTaskId('runtime:mini', 'local-task')
    expect(dispatcherClientTaskId('runtime:mini', token)).toBe('local-task')
    expect(dispatcherClientTaskId('runtime:mini', 'native')).toBe('runtime:mini/native')
    expect(dispatcherClientTaskId('local', 'runtime:old/task')).toBe('runtime:old/task')
  })

  it('keeps missing or ambiguous installation identities unresolved and refuses to write them as native tasks', () => {
    const token = 'runtime:dispatcher-missing/task'
    expect(dispatcherClientTaskId('runtime:mini', token)).toBe(token)
    expect(isResolvedDispatcherTaskId(token)).toBe(false)
    expect(() => dispatcherSourceTaskId('runtime:mini', token)).toThrow('identity')
    expect(dispatcherClientTaskId('runtime:mini', 'runtime:creator-peer/task')).toContain(
      'dispatcher-unresolved'
    )
    const copied = [
      ...fixture.partitions,
      { endpoint: 'runtime:copy' as const, installationId: fixture.partitions[0].installationId }
    ]
    const known = dispatcherSourceTaskId('runtime:mini', 'local-task')
    expect(dispatcherClientTaskId('runtime:mini', known, copied)).toBe(known)
  })

  it('qualifies each proposal field and source-local target without changing human task refs or project names', () => {
    expect(
      dispatcherClientProposalItem('runtime:mini', {
        kind: 'start',
        title: 'a',
        prompt: 'b',
        project: 'APP',
        target: { repoId: 'repo' }
      })
    ).toEqual({
      kind: 'start',
      title: 'a',
      prompt: 'b',
      project: 'APP',
      target: { repoId: 'repo', hostId: 'runtime:mini' }
    })
    expect(
      dispatcherClientProposalItem('runtime:mini', {
        kind: 'subtask',
        parentTaskId: 'parent',
        title: 'a',
        prompt: 'b'
      })
    ).toMatchObject({ parentTaskId: 'runtime:mini/parent' })
    expect(
      dispatcherClientProposalItem('runtime:mini', { kind: 'append', taskId: 'APP-7', text: 'b' })
    ).toMatchObject({ taskId: 'APP-7' })
    expect(
      dispatcherClientProposalItem('runtime:mini', {
        kind: 'link',
        taskId: 'task',
        target: { worktreeId: 'folder:source', hostId: 'ssh:owned' }
      })
    ).toMatchObject({
      taskId: 'runtime:mini/task',
      target: { hostId: 'runtime:mini', worktreeId: 'folder:source' }
    })
  })
})
