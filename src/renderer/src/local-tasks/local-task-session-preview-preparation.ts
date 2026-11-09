import { z } from 'zod'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import { localTaskIdEndpoint, SELF_LOCAL_TASK_ENDPOINT } from './local-task-endpoints'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { useAppStore } from '@/store'

const preparationResult = z.object({ ok: z.literal(true), prepared: z.boolean() })

/** Paired workspaces already follow their host's tab stream; only this window's library needs IPC projection. */
export async function prepareLocalTaskSessionPreview(
  link: Pick<LocalTaskSessionLink, 'id' | 'hostId' | 'surface'>
): Promise<boolean | null> {
  if (
    link.surface !== 'terminal' ||
    localTaskIdEndpoint(link.id) !== SELF_LOCAL_TASK_ENDPOINT ||
    !isLocalTaskHostInContact(useAppStore.getState(), link.hostId)
  ) {
    return null
  }
  const response = await window.api.runtime.call({
    method: 'localTasks.links.prepareSession',
    params: { sessionLinkId: link.id }
  })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  return preparationResult.parse(response.result).prepared
}
