import { describe, expect, it } from 'vitest'
import {
  isLocalTaskForeignSessionHostId,
  localTaskForeignSessionHostId,
  localTaskSessionHostAliases,
  LocalTaskSessionExecutionOriginSchema,
  parseLocalTaskForeignSessionHostId
} from './local-task-session-origin'
import { LocalTasksLinksRecordSessionParams } from './local-tasks-link-rpc-params'
import { localTaskSessionLinkSchema } from './local-task-link-read-schemas'

const INSTALLATION = '11111111-1111-4111-8111-111111111111'

describe('local task session execution origin', () => {
  it.each(['local', 'ssh:build', 'ssh:a%2Fb'])(
    'round trips a stable %s execution location',
    (hostId) => {
      const origin = { installationId: INSTALLATION, hostId }
      const key = localTaskForeignSessionHostId(origin)
      expect(key).toBe(`foreign:${INSTALLATION}/${encodeURIComponent(hostId)}`)
      expect(parseLocalTaskForeignSessionHostId(key!)).toEqual(origin)
      expect(isLocalTaskForeignSessionHostId(key!)).toBe(true)
    }
  )

  it('rejects client-local environment routes and malformed origin identities', () => {
    expect(
      localTaskForeignSessionHostId({ installationId: INSTALLATION, hostId: 'runtime:mini' })
    ).toBeNull()
    expect(
      localTaskForeignSessionHostId({ installationId: 'runtime-incarnation', hostId: 'local' })
    ).toBeNull()
    expect(
      parseLocalTaskForeignSessionHostId(`foreign:${INSTALLATION}/ssh%3Abuild/extra`)
    ).toBeNull()
    expect(parseLocalTaskForeignSessionHostId(`foreign:${INSTALLATION}/%zz`)).toBeNull()
    expect(
      LocalTaskSessionExecutionOriginSchema.safeParse({
        installationId: INSTALLATION,
        hostId: 'runtime:mini',
        hostLabel: 'mini'
      }).success
    ).toBe(false)
  })

  it.each(['local', 'ssh:owned'])(
    'aliases a %s foreign key only with its own profile native host',
    (hostId) => {
      const key = localTaskForeignSessionHostId({ installationId: INSTALLATION, hostId })!
      expect(localTaskSessionHostAliases(hostId, INSTALLATION)).toEqual([hostId, key])
      expect(localTaskSessionHostAliases(key, INSTALLATION)).toEqual([key, hostId])
      expect(localTaskSessionHostAliases(key, '22222222-2222-4222-8222-222222222222')).toEqual([
        key
      ])
      expect(localTaskSessionHostAliases(hostId)).toEqual([hostId])
    }
  )

  it('preserves optional origin metadata in request and read schemas', () => {
    const executionOrigin = {
      installationId: INSTALLATION,
      hostId: 'local',
      hostLabel: 'Local Mac'
    }
    const input = {
      clientOperationId: 'op',
      taskId: 'task',
      hostId: 'local',
      worktreeId: 'repo::/work',
      surface: 'terminal',
      paneKey: 'tab:leaf',
      linkedVia: 'manual',
      replacingSessionLinkId: 'old-link',
      executionOrigin
    }
    expect(LocalTasksLinksRecordSessionParams.parse(input).executionOrigin).toEqual(executionOrigin)
    expect(LocalTasksLinksRecordSessionParams.parse(input).replacingSessionLinkId).toBe('old-link')
    expect(
      LocalTasksLinksRecordSessionParams.safeParse({ ...input, linkedVia: 'start' }).success
    ).toBe(false)
    const read = {
      id: 'link',
      ...input,
      instanceId: null,
      tabId: null,
      sessionId: null,
      providerSession: null,
      agent: null,
      openedAt: 1
    }
    expect(localTaskSessionLinkSchema.parse(read).executionOrigin).toEqual(executionOrigin)
  })
})
