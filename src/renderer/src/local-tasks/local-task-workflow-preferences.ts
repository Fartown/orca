import { localTaskIdEndpoint } from './local-task-endpoints'
import { localTasksDomainStore } from './local-tasks-domain-store'

export function localTaskWorkflowPreferences(taskId: string): {
  brief: boolean
  delivery: 'auto-submit' | 'draft'
} {
  const domain = localTasksDomainStore.getState()
  const preferences =
    domain.partitions.find((partition) => partition.endpoint === localTaskIdEndpoint(taskId))
      ?.preferences ?? domain.preferences
  return {
    brief: preferences.taskBrief !== '0',
    delivery: preferences.sessionSend === 'draft' ? 'draft' : 'auto-submit'
  }
}
