import type { AppState } from '@/store/types'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { selectLocalTaskReviewWorktreeIds } from './local-task-link-maintenance'

/** Linked workspaces of open tasks in every library, joined to the visible-review refresh set (A4). */
export function localTaskReviewRefreshWorktreeIds(state: AppState): string[] {
  return localTasksDomainStore
    .getState()
    .partitions.flatMap((library) =>
      library.linksLoaded ? selectLocalTaskReviewWorktreeIds(state, library) : []
    )
}
