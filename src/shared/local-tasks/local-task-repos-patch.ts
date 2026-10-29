import type { LocalTaskProject } from './local-task-types'
import type { LocalTasksProjectsUpdateInput } from './local-tasks-rpc-params'

export type LocalTaskRepoEdit = { kind: 'add' | 'remove' | 'default'; repoId: string }

/**
 * The `projects.update` patch for one edit of a project's repos (REQ-001), null when it changes
 * nothing: the list goes whole, and the host keeps the default while it is still listed, else
 * takes the first. Shared so the desktop and the phone send the same patch.
 */
export function localTaskReposPatch(
  project: Pick<LocalTaskProject, 'repos' | 'defaultRepoId'>,
  edit: LocalTaskRepoEdit
): Pick<LocalTasksProjectsUpdateInput, 'repos' | 'defaultRepoId'> | null {
  const listed = project.repos.includes(edit.repoId)
  switch (edit.kind) {
    case 'add':
      return listed ? null : { repos: [...project.repos, edit.repoId] }
    case 'remove':
      return listed ? { repos: project.repos.filter((repo) => repo !== edit.repoId) } : null
    case 'default':
      return listed && project.defaultRepoId !== edit.repoId ? { defaultRepoId: edit.repoId } : null
  }
}
