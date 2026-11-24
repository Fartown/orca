import * as z from 'zod'
import { RuntimeHostDescriptorSchema } from '../remote-runtime/host-status/runtime-host-descriptor'
import { toLocalTaskOwnedHostId } from './local-task-endpoint-ids'
import type { LocalTaskSessionProgress } from './local-task-link-types'

export const LocalTaskSessionExecutionOriginSchema = z.object({
  installationId: RuntimeHostDescriptorSchema.shape.installationId,
  hostId: z
    .string()
    .min(1)
    .max(512)
    .refine((value) => toLocalTaskOwnedHostId(value) !== null)
    .transform((value) => toLocalTaskOwnedHostId(value) ?? value),
  hostLabel: z.string().min(1).max(512)
})

export type LocalTaskSessionExecutionOrigin = z.infer<typeof LocalTaskSessionExecutionOriginSchema>

const FOREIGN_PREFIX = 'foreign:'

/** The execution profile, then that profile's own location; never a client's environment id. */
export function localTaskForeignSessionHostId(
  origin: Pick<LocalTaskSessionExecutionOrigin, 'installationId' | 'hostId'>
): string | null {
  const installation = RuntimeHostDescriptorSchema.shape.installationId.safeParse(
    origin.installationId
  )
  const hostId = toLocalTaskOwnedHostId(origin.hostId)
  return installation.success && hostId
    ? `${FOREIGN_PREFIX}${installation.data}/${encodeURIComponent(hostId)}`
    : null
}

export function parseLocalTaskForeignSessionHostId(
  value: string
): Pick<LocalTaskSessionExecutionOrigin, 'installationId' | 'hostId'> | null {
  if (!value.startsWith(FOREIGN_PREFIX)) {
    return null
  }
  const [installationId, encodedHost, extra] = value.slice(FOREIGN_PREFIX.length).split('/')
  if (!installationId || !encodedHost || extra !== undefined) {
    return null
  }
  try {
    const hostId = toLocalTaskOwnedHostId(decodeURIComponent(encodedHost))
    const origin = hostId ? { installationId, hostId } : null
    return origin && localTaskForeignSessionHostId(origin) === value ? origin : null
  } catch {
    return null
  }
}

export function isLocalTaskForeignSessionHostId(value: string): boolean {
  return parseLocalTaskForeignSessionHostId(value) !== null
}

/** Native rows predate profile identity; only this profile's same execution host aliases them. */
export function localTaskSessionHostAliases(
  hostId: string,
  selfInstallationId?: string | null
): string[] {
  const origin = parseLocalTaskForeignSessionHostId(hostId)
  if (origin) {
    return origin.installationId === selfInstallationId ? [hostId, origin.hostId] : [hostId]
  }
  const foreign = selfInstallationId
    ? localTaskForeignSessionHostId({ installationId: selfInstallationId, hostId })
    : null
  return foreign ? [hostId, foreign] : [hostId]
}

export function unverifiableLocalTaskOriginProgress(
  taskSessionId: string
): LocalTaskSessionProgress {
  return {
    taskSessionId,
    state: 'unverifiable',
    lastMessage: null,
    stateSince: null,
    unread: false
  }
}
