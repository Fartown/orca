import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getReachableRuntimeEnvironmentIds } from '@/hooks/ipc-events/runtime-environment-subscription-selection'
import { localTaskClientId, localTaskEndpointEnvironmentId } from './local-task-endpoints'
import { subscribeLocalTaskAppStore } from './local-task-app-store-subscription'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { openLocalTaskPage } from './local-task-navigation'
import { parseLocalTaskDeepLink } from '../../../shared/local-tasks/local-task-deep-link'

let stopPending: (() => void) | null = null
const DUPLICATE_LINK_WINDOW_MS = 3_000
let lastLink: string | null = null
let lastLinkAt = 0

export function openLocalTaskDeepLink(link: string): void {
  const target = parseLocalTaskDeepLink(link)
  if (!target) {
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
  const taskId = localTaskClientId(target.endpoint, target.taskId)
  openLocalTaskPage()
  const locate = (): boolean => {
    const partitions = localTasksDomainStore.getState().partitions
    const partition = partitions.find((item) => item.endpoint === target.endpoint)
    if (!partition) {
      if (target.endpoint === 'local' && partitions.length === 0) {
        return false
      }
      const environmentId = localTaskEndpointEnvironmentId(target.endpoint)
      if (environmentId) {
        const app = useAppStore.getState()
        if (!app.runtimeEnvironmentCatalogSettled) {
          return false
        }
        if (app.runtimeEnvironments.some((item) => item.id === environmentId)) {
          if (getReachableRuntimeEnvironmentIds(app).includes(environmentId)) {
            return false
          }
          toast.error(
            translate(
              'localTasks.detail.linkLibraryUnavailable',
              'Task library is disconnected; no saved task is available'
            )
          )
          return true
        }
      }
      toast.error(
        translate(
          'localTasks.detail.linkLibraryMissing',
          'Task library is not available in this Orca'
        )
      )
      return true
    }
    const task = partition.tasks.find((item) => item.id === taskId)
    if (task) {
      openLocalTaskPage({ taskId })
      if (!partition.inContact) {
        toast.warning(
          translate(
            'localTasks.detail.linkLibraryOffline',
            'Task library is disconnected; showing saved task'
          )
        )
      }
      return true
    }
    if (
      !partition.inContact ||
      partition.tasksLoaded ||
      ['unsupported', 'failed', 'ended'].includes(partition.connection) ||
      (partition.connection === 'idle' && partition.projectCount === 0)
    ) {
      toast.error(
        translate('localTasks.detail.linkTaskMissing', 'Task is not available in its library')
      )
      return true
    }
    return false
  }
  if (locate()) {
    return
  }
  const stopDomain = localTasksDomainStore.subscribe(() => {
    if (locate()) {
      stopPending?.()
      stopPending = null
    }
  })
  const stopApp = subscribeLocalTaskAppStore('task link navigation', () => {
    if (locate()) {
      stopPending?.()
      stopPending = null
    }
  })
  stopPending = () => {
    stopDomain()
    stopApp()
  }
}
