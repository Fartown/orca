import * as z from 'zod'
import { RuntimeHostDescriptorSchema } from '../../../src/shared/remote-runtime/host-status/runtime-host-descriptor'
import type { LocalTaskSessionExecutionOrigin } from '../../../src/shared/local-tasks/local-task-session-origin'
import { SELF_LOCAL_TASK_ENDPOINT, type LocalTaskEndpoint } from './local-task-endpoint'

export type LocalTaskExecutionRoute = { hostId: string; endpoint: LocalTaskEndpoint }

export type LocalTaskExecutionOriginResolver = (
  origin: LocalTaskSessionExecutionOrigin
) => LocalTaskExecutionRoute | null

const statusIdentity = z.object({ hostDescriptor: RuntimeHostDescriptorSchema })

/** Already authenticated, connected clients only; no lookup, connection or request is started. */
export function resolveLocalTaskExecutionOrigin(
  origin: LocalTaskSessionExecutionOrigin,
  known: readonly {
    hostId: string
    connected: boolean
    status: unknown
    endpoint?: LocalTaskEndpoint
  }[]
): LocalTaskExecutionRoute | null {
  const routes = new Map<string, LocalTaskExecutionRoute>()
  for (const candidate of known) {
    if (!candidate.connected) {
      continue
    }
    const parsed = statusIdentity.safeParse(candidate.status)
    if (parsed.success && parsed.data.hostDescriptor.installationId === origin.installationId) {
      const endpoint = candidate.endpoint ?? SELF_LOCAL_TASK_ENDPOINT
      routes.set(`${candidate.hostId}:${endpoint.key}`, { hostId: candidate.hostId, endpoint })
    }
  }
  return routes.size === 1 ? (routes.values().next().value ?? null) : null
}
