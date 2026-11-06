import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { firstStatusInCategory } from './local-task-grouping'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTasksClient } from './local-tasks-runtime-client'

export const dispatchTitle = (text: string): string =>
  (text.trim().split(/[。.!?！？\n]/, 1)[0] ?? '').trim().slice(0, 60)

export async function createDispatchTask(
  project: LocalTaskProject,
  text: string,
  parentId: string | null
): Promise<LocalTask | null> {
  const result = await localTasksClient.createTask({
    projectId: project.id,
    title: dispatchTitle(text) || text.trim().slice(0, 60),
    description: text.trim(),
    statusId: firstStatusInCategory(project, 'started')?.id,
    parentId
  })
  if (!result.ok) {
    return null
  }
  localTasksDomainStore.getState().upsertTasks([result.task], { created: true })
  return result.task
}
