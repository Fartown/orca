import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getReachableRuntimeEnvironmentIds } from '@/hooks/ipc-events/runtime-events/runtime-environment-subscription-selection'
import { localTaskClientId, localTaskEndpointEnvironmentId } from './local-task-endpoints'
import { subscribeLocalTaskAppStore } from './local-task-app-store-subscription'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { openLocalTaskPage } from './local-task-navigation'
import {
  isLocalTaskDeepLinkCandidate,
  parseLocalTaskDeepLink
} from '../../../shared/local-tasks/local-task-deep-link'

let stopPending: (() => void) | null = null
const DUPLICATE_LINK_WINDOW_MS = 3_000
let lastLink: string | null = null
let lastLinkAt = 0

export function openLocalTaskDeepLink(link: string): void {
  if (!isLocalTaskDeepLinkCandidate(link)) {
    return
  }
  const now = Date.now()
  if (link === lastLink && now >= lastLinkAt && now - lastLinkAt < DUPLICATE_LINK_WINDOW_MS) {
    return
  }
  lastLink = link
  lastLinkAt = now
  stopPending?.()
  stopPending = null
  const target = parseLocalTaskDeepLink(link)
  if (!target) {
    toast.error(translate('localTasks.detail.linkInvalid', 'Task link is invalid'))
    return
  }
  const taskId = localTaskClientId(target.endpoint, target.taskId)
  openLocalTaskPage()
  let settled = false
  let stopDomain: (() => void) | null = null
  let stopApp: (() => void) | null = null
  const cancel = (): void => {
    settled = true
    stopDomain?.()
    stopApp?.()
  }
  const locate = (): (() => void) | null => {
    const partitions = localTasksDomainStore.getState().partitions
    const partition = partitions.find((item) => item.endpoint === target.endpoint)
    if (!partition) {
      if (target.endpoint === 'local' && partitions.length === 0) {
        return null
      }
      const environmentId = localTaskEndpointEnvironmentId(target.endpoint)
      if (environmentId) {
        const app = useAppStore.getState()
        if (!app.runtimeEnvironmentCatalogSettled) {
          return null
        }
        if (app.runtimeEnvironments.some((item) => item.id === environmentId)) {
          if (getReachableRuntimeEnvironmentIds(app).includes(environmentId)) {
            return null
          }
          return () =>
            toast.error(
              translate(
                'localTasks.detail.linkLibraryUnavailable',
                'Task library is disconnected; no saved task is available'
              )
            )
        }
      }
      return () =>
        toast.error(
          translate(
            'localTasks.detail.linkLibraryMissing',
            'Task library is not available in this Orca'
          )
        )
    }
    const task = partition.tasks.find((item) => item.id === taskId)
    if (task) {
      const offline = !partition.inContact
      return () => {
        openLocalTaskPage({ taskId })
        if (offline) {
          toast.warning(
            translate(
              'localTasks.detail.linkLibraryOffline',
              'Task library is disconnected; showing saved task'
            )
          )
        }
      }
    }
    if (
      !partition.inContact ||
      partition.tasksLoaded ||
      ['unsupported', 'failed', 'ended'].includes(partition.connection) ||
      (partition.connection === 'idle' && partition.projectCount === 0)
    ) {
      return () =>
        toast.error(
          translate('localTasks.detail.linkTaskMissing', 'Task is not available in its library')
        )
    }
    return null
  }
  const finish = (): void => {
    if (settled) {
      return
    }
    const action = locate()
    if (!action) {
      return
    }
    cancel()
    if (stopPending === cancel) {
      stopPending = null
    }
    action()
  }
  finish()
  if (settled) {
    return
  }
  stopDomain = localTasksDomainStore.subscribe(finish)
  stopApp = subscribeLocalTaskAppStore('task link navigation', finish)
  stopPending = cancel
}
