import { describe, expect, it } from 'vitest'
import { mapDispatcherError } from '../runtime/rpc/dispatcher-error-response'
import {
  ARTIFACT_SHARE_ERROR_CODES,
  ArtifactShareError
} from '../../shared/self-hosted-artifacts/artifact-share-errors'

const meta = { runtimeId: 'runtime-1' }

function request(method: string) {
  return { id: 'req-1', authToken: 'token', method }
}

describe('artifact share RPC errors', () => {
  it('keeps the sharing code and message for artifactShare methods', () => {
    const error = new ArtifactShareError(
      ARTIFACT_SHARE_ERROR_CODES.orcaNotRunning,
      "Orca isn't open on minizc."
    )

    expect(mapDispatcherError(request('artifactShare.share'), meta, error)).toMatchObject({
      ok: false,
      error: {
        code: ARTIFACT_SHARE_ERROR_CODES.orcaNotRunning,
        message: "Orca isn't open on minizc."
      }
    })
  })

  it('maps other failures the way every runtime method does', () => {
    expect(
      mapDispatcherError(request('artifactShare.list'), meta, new Error('boom'))
    ).toMatchObject({ ok: false, error: { code: 'runtime_error', message: 'boom' } })
    expect(
      mapDispatcherError(
        request('files.read'),
        meta,
        new ArtifactShareError(ARTIFACT_SHARE_ERROR_CODES.pathDenied, 'denied')
      )
    ).toMatchObject({ ok: false, error: { code: 'runtime_error' } })
  })
})
