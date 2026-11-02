import { defineMethod } from '../runtime/rpc/core'
import { HostPathGrant } from '../../shared/rpc-contract/files-params'

/** The host mints a grant for an absolute path outside the worktree (REQ-801). */
export const HOST_PATH_GRANT_METHODS = [
  defineMethod({
    permission: 'workspace',
    name: 'files.grantHostPath',
    params: HostPathGrant,
    handler: async (params, { runtime, clientId }) =>
      runtime.grantHostPath(params.worktree, params.absolutePath, clientId)
  })
]
