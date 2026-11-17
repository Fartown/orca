import { describe, expect, it } from 'vitest'
import { resolveLocalTaskExecutionOrigin } from './local-task-execution-origin'
import { localTaskEndpointFor, SELF_LOCAL_TASK_ENDPOINT } from './local-task-endpoint'

const origin = {
  installationId: '11111111-1111-4111-8111-111111111111',
  hostId: 'local',
  hostLabel: 'Local Mac'
}
const status = { hostDescriptor: { installationId: origin.installationId } }

describe('cached mobile cross-host task session routes', () => {
  it('routes only an already connected client whose cached authenticated status names the origin', () => {
    expect(
      resolveLocalTaskExecutionOrigin(origin, [
        {
          hostId: 'mini',
          connected: true,
          status: { hostDescriptor: { installationId: '22222222-2222-4222-8222-222222222222' } }
        },
        { hostId: 'mac', connected: true, status }
      ])
    ).toEqual({ hostId: 'mac', endpoint: SELF_LOCAL_TASK_ENDPOINT })
  })

  it('fails closed with an offline, missing or ambiguous descriptor', () => {
    expect(
      resolveLocalTaskExecutionOrigin(origin, [{ hostId: 'mac', connected: false, status }])
    ).toBeNull()
    expect(
      resolveLocalTaskExecutionOrigin(origin, [{ hostId: 'mini', connected: true, status: {} }])
    ).toBeNull()
    expect(
      resolveLocalTaskExecutionOrigin(origin, [
        { hostId: 'mac', connected: true, status },
        { hostId: 'copied-profile', connected: true, status }
      ])
    ).toBeNull()
  })

  it('keeps a trusted relayed endpoint and deduplicates the same route', () => {
    const endpoint = localTaskEndpointFor('runtime:mac')
    const candidate = { hostId: 'paired-desktop', connected: true, status, endpoint }
    expect(resolveLocalTaskExecutionOrigin(origin, [candidate, candidate])).toEqual({
      hostId: 'paired-desktop',
      endpoint
    })
  })
})
