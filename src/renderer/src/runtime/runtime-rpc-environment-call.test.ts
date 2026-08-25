import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/e2e-config', () => ({ e2eConfig: { enabled: true } }))

import { callRuntimeEnvironmentWithRevision } from './runtime-rpc-environment-call'

const apiCall = vi.fn()
const e2eCall = vi.fn()

beforeEach(() => {
  apiCall.mockReset()
  e2eCall.mockReset()
  vi.stubGlobal('window', {
    api: { runtimeEnvironments: { call: apiCall } },
    __runtimeEnvironmentCallE2E: e2eCall
  })
})

describe('runtime environment E2E transport seam', () => {
  it('routes the packaged-test call before the contextBridge API', async () => {
    e2eCall.mockResolvedValue({ ok: true })

    await expect(
      callRuntimeEnvironmentWithRevision({
        environmentId: 'runtime-a',
        method: 'issues.status',
        params: { authorityExecutionHostId: 'local' },
        timeoutMs: 50
      })
    ).resolves.toEqual({ ok: true })
    expect(e2eCall).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: 'runtime-a', method: 'issues.status' })
    )
    expect(apiCall).not.toHaveBeenCalled()
  })
})
