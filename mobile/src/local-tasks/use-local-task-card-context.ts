import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { localTaskListedHostId, type LocalTaskSite } from './local-task-endpoint'
import type { LocalTaskCardContext } from './local-task-needs-you-list'
import { localTaskWorkspaceLinkFor } from './local-task-progress-projection'
import { localTaskReviewLabel } from './local-task-workspace-review-line'
import { localTaskWorkspaceVerdict } from './local-task-workspace-row'
import { useLocalTaskHostDirectory } from './use-local-task-host-labels'
import { useLocalTaskWorkspaceListing } from './use-local-task-workspace-listing'
import type { LocalTasksLibrary } from './use-local-tasks-library'

/**
 * How the page's cards name hosts and PRs. Host names and the paired host's word on its SSH hosts
 * are read once; the workspace list is read once per set of tasks awaiting acceptance, and only
 * while the library's host is in contact. Nothing retries or polls.
 */
export function useLocalTaskCardContext(args: {
  site: LocalTaskSite
  library: Pick<LocalTasksLibrary, 'tasks' | 'work'>
  reviewTasks: readonly LocalTask[]
}): { context: LocalTaskCardContext; connected: ReadonlyMap<string, boolean> } {
  const { site, library } = args
  const listed = (ownerHostId: string) =>
    localTaskListedHostId(site.endpoint, ownerHostId) ?? ownerHostId
  const directory = useLocalTaskHostDirectory(
    site.pairedClient,
    library.work.links.workspaces.map((link) => listed(link.hostId))
  )
  const tasksById = new Map(library.tasks.map((task) => [task.id, task]))
  const reviewLinks = args.reviewTasks.flatMap((task) => {
    const link = localTaskWorkspaceLinkFor(task, tasksById, library.work.links)
    return link ? [{ task, link }] : []
  })
  const subject =
    reviewLinks.length > 0
      ? reviewLinks
          .map(({ link }) => [link.taskId, link.hostId, link.worktreeId, link.linkedAt].join(':'))
          .sort()
          .join('\u0000')
      : null
  const listing = useLocalTaskWorkspaceListing({
    client: site.client,
    key: site.endpoint.executionHost ?? site.hostId,
    subject,
    open: site.connState === 'connected' && subject !== null
  })
  const hostConnected = (ownerHostId: string): boolean | null =>
    ownerHostId === 'local' ? null : (directory.connected.get(listed(ownerHostId)) ?? null)
  const context: LocalTaskCardContext = {
    hostName: (ownerHostId, snapshot) =>
      ownerHostId === 'local'
        ? site.label
        : (directory.labels.get(listed(ownerHostId)) ?? snapshot ?? ''),
    hostConnected,
    reviewDetail: (task) => {
      const entry = reviewLinks.find((candidate) => candidate.task.id === task.id)
      if (!entry || listing.status !== 'ready') {
        return null
      }
      const inContact = hostConnected(entry.link.hostId) !== false
      const verdict = localTaskWorkspaceVerdict(entry.link, listing.listing, inContact)
      return verdict.kind === 'found' && verdict.review
        ? localTaskReviewLabel(verdict.review, inContact)
        : null
    }
  }
  return { context, connected: directory.connected }
}
