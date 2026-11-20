import { describe, expect, it } from 'vitest'
import { UNRESOLVED_OWNER_HOST_ID } from '../../../shared/execution-host/execution-host'
import type { RuntimeEnvironmentStatus } from '../../../shared/remote-runtime/host-status/runtime-host-status'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTaskSessionExecutionOrigin } from '../../../shared/local-tasks/local-task-session-origin'
import {
  localTaskSessionOriginClientIds,
  projectLocalTaskSessionExecutionOrigin,
  resolveLocalTaskSessionOriginRoute
} from './local-task-session-origin-route'

const SELF = '2db7ea0a-15f2-4acf-a37b-a9e078c4a6bb'
const MINI = 'd3ab9ac0-f5a4-49c5-a25f-2b1791e98e2d'
const LEAF = 'ceca0499-165a-4d36-91bb-d0f88f666610'
const origin: LocalTaskSessionExecutionOrigin = {
  installationId: MINI,
  hostId: 'local',
  hostLabel: 'mini'
}

function runtime(installationId: string): RuntimeEnvironmentStatus {
  return {
    checkedAt: 1,
    status: {
      runtimeId: 'runtime-instance',
      rendererGraphEpoch: 1,
      graphStatus: 'ready',
      authoritativeWindowId: 1,
      liveTabCount: 1,
      liveLeafCount: 1,
      hostDescriptor: { installationId }
    }
  }
}

function state(
  entries: [string, RuntimeEnvironmentStatus][] = [['mini-environment', runtime(MINI)]]
) {
  return { runtimeStatusByEnvironmentId: new Map(entries) }
}

describe('source installation routes', () => {
  it('routes mini local to the paired source and client local only to the matching self identity', () => {
    expect(resolveLocalTaskSessionOriginRoute(state(), SELF, origin)).toEqual({
      hostId: 'runtime:mini-environment',
      authority: {
        endpoint: { kind: 'environment', environmentId: 'mini-environment' },
        at: 'local'
      }
    })
    expect(
      resolveLocalTaskSessionOriginRoute(state(), SELF, { ...origin, installationId: SELF })
    ).toEqual({
      hostId: 'local',
      authority: { endpoint: { kind: 'self' }, at: 'local' }
    })
    expect(resolveLocalTaskSessionOriginRoute(state([]), SELF, origin).hostId).toBe(
      UNRESOLVED_OWNER_HOST_ID
    )
  })

  it('preserves a source Orca nested SSH location without making it a client-dialable SSH target', () => {
    const ssh = { ...origin, hostId: 'ssh:build%2Fbox' }
    expect(resolveLocalTaskSessionOriginRoute(state(), SELF, ssh)).toEqual({
      hostId: 'runtime:mini-environment',
      authority: {
        endpoint: { kind: 'environment', environmentId: 'mini-environment' },
        at: 'ssh:build%2Fbox'
      }
    })
    expect(
      resolveLocalTaskSessionOriginRoute(state(), MINI, { ...ssh, installationId: MINI }).hostId
    ).toBe(UNRESOLVED_OWNER_HOST_ID)
    expect(resolveLocalTaskSessionOriginRoute(state([]), MINI, ssh).hostId).toBe('ssh:build%2Fbox')
  })

  it('refuses missing, conflicting, revoked and non-owner-relative identities', () => {
    const unresolved = { hostId: UNRESOLVED_OWNER_HOST_ID, authority: null }
    expect(resolveLocalTaskSessionOriginRoute(state([]), undefined, origin)).toEqual(unresolved)
    expect(
      resolveLocalTaskSessionOriginRoute(
        state([
          ['first', runtime(MINI)],
          ['second', runtime(MINI)]
        ]),
        SELF,
        origin
      )
    ).toEqual(unresolved)
    expect(
      resolveLocalTaskSessionOriginRoute(state(), SELF, { ...origin, hostId: 'runtime:elsewhere' })
    ).toEqual(unresolved)
    const entry = runtime(MINI)
    entry.snapshot = {
      environmentId: 'revoked',
      pairingRevision: 1,
      sequence: 1,
      checkedAt: 1,
      status: entry.status,
      verification: 'blocked',
      transport: 'disconnected'
    }
    expect(resolveLocalTaskSessionOriginRoute(state([['revoked', entry]]), SELF, origin)).toEqual(
      unresolved
    )
  })

  it('keeps the last verified source identity through transport loss without resolving to local', () => {
    const entry = runtime(MINI)
    entry.snapshot = {
      environmentId: 'mini-environment',
      pairingRevision: 1,
      sequence: 1,
      checkedAt: 1,
      status: entry.status,
      verification: 'unavailable',
      transport: 'disconnected'
    }
    entry.status = null
    expect(
      resolveLocalTaskSessionOriginRoute(state([['mini-environment', entry]]), SELF, origin).hostId
    ).toBe('runtime:mini-environment')
  })
})

describe('foreign session client projection', () => {
  const source: LocalTaskSessionLink = {
    id: 'runtime:task-library/link',
    taskId: 'runtime:task-library/task',
    hostId: `foreign:${MINI}/local`,
    executionOrigin: origin,
    worktreeId: 'folder:source-folder',
    instanceId: null,
    surface: 'terminal',
    tabId: 'source-tab',
    paneKey: `source-tab:${LEAF}`,
    sessionId: null,
    providerSession: null,
    agent: 'codex',
    linkedVia: 'manual',
    openedAt: 1
  }

  it('mirrors source terminal ids independently of the task-library endpoint and retains raw input', () => {
    const projected = projectLocalTaskSessionExecutionOrigin(state(), SELF, source)
    expect(projected).toMatchObject({
      id: source.id,
      taskId: source.taskId,
      hostId: 'runtime:mini-environment',
      tabId: 'web-terminal-source-tab',
      paneKey: `web-terminal-source-tab:${LEAF}`
    })
    expect(source.tabId).toBe('source-tab')
    expect(source.hostId).toBe(`foreign:${MINI}/local`)
    expect(projectLocalTaskSessionExecutionOrigin(state([]), MINI, source)).toMatchObject({
      hostId: 'local',
      tabId: 'source-tab',
      paneKey: `source-tab:${LEAF}`
    })
  })

  it('keeps structured-chat ids raw and preserves ordinary links by reference', () => {
    const route = resolveLocalTaskSessionOriginRoute(state(), SELF, origin)
    expect(localTaskSessionOriginClientIds(route, { ...source, surface: 'chat' })).toEqual({
      tabId: 'source-tab',
      paneKey: `source-tab:${LEAF}`
    })
    const { executionOrigin: _, ...ordinary } = source
    expect(projectLocalTaskSessionExecutionOrigin(state(), SELF, ordinary)).toBe(ordinary)
  })
})
