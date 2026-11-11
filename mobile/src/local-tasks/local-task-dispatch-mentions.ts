import type { LocalTaskLinks } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTaskChoice } from './local-task-choice-sheet'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskWorkspaceLinkFor } from './local-task-progress-projection'
import type { LocalTaskSetup } from './local-task-project-setups'
import {
  localTaskLinkHolding,
  type LocalTaskWorkspaceCandidate
} from './local-task-workspace-candidates'

/** How the picker names hosts; every id here is owner-relative (`local`, `ssh:{t}`). */
export type LocalTaskMentionHosts = {
  name: (ownerHostId: string) => string
  /** The paired host's word: true connected, false not, null when it gave none. */
  connected: (ownerHostId: string) => boolean | null
}

/**
 * The @ picker's rows, grouped Workspaces, Repositories, Tasks, Hosts. Each says which repository
 * and host it is on, which task already holds it, and greys out what sits on a host the paired
 * host says is not connected. Host and repository rows narrow the others, as before.
 */
export function localTaskMentionChoices(args: {
  query: string
  setups: readonly LocalTaskSetup[]
  candidates: readonly LocalTaskWorkspaceCandidate[]
  tasks: readonly LocalTask[]
  links: LocalTaskLinks
  hostFilter: string | null
  repoFilter: string | null
  repoLabels: ReadonlyMap<string, string>
  hosts: LocalTaskMentionHosts
  onHost: (ownerHostId: string) => void
  onRepo: (repoId: string) => void
  onWorkspace: (workspace: LocalTaskWorkspaceCandidate) => void
  onTask: (task: LocalTask) => void
}): LocalTaskChoice[] {
  const copy = localTasksCopy().work.mention
  const { hostFilter, repoFilter, hosts } = args
  const matches = (value: string) => value.toLowerCase().includes(args.query.toLowerCase())
  const offline = (hostId: string) => hosts.connected(hostId) === false
  const hostLine = (hostId: string) =>
    offline(hostId) ? `${hosts.name(hostId)} ${copy.hostNotConnected}` : hosts.name(hostId)
  const tasksById = new Map(args.tasks.map((task) => [task.id, task]))
  const workspaces = args.candidates
    .filter(
      (entry) =>
        (hostFilter === null || entry.hostId === hostFilter) &&
        (repoFilter === null || entry.repoId === repoFilter) &&
        matches(`${entry.displayName} ${entry.branch}`)
    )
    .map((entry): LocalTaskChoice => {
      const holder = localTaskLinkHolding(args.links, entry)
      const holderTask = holder ? tasksById.get(holder.taskId) : undefined
      return {
        key: `workspace:${entry.hostId}:${entry.worktreeId}`,
        section: copy.workspaces,
        label: entry.displayName,
        subtitle: [args.repoLabels.get(entry.repoId), hostLine(entry.hostId)]
          .filter(Boolean)
          .join(' · '),
        tag: holderTask ? copy.belongsTo(holderTask.ref) : undefined,
        disabled: offline(entry.hostId),
        onPress: () => args.onWorkspace(entry)
      }
    })
  const repos = Array.from(new Map(args.setups.map((entry) => [entry.repoId, entry])).values())
    .filter(
      (entry) => (hostFilter === null || entry.ownerHostId === hostFilter) && matches(entry.label)
    )
    .map((entry): LocalTaskChoice => ({
      key: `repo:${entry.repoId}`,
      section: copy.repositories,
      label: entry.label,
      subtitle: [hostLine(entry.ownerHostId), copy.newWorkspaceHere].join(' · '),
      disabled: offline(entry.ownerHostId),
      onPress: () => args.onRepo(entry.repoId)
    }))
  const tasks = args.tasks.flatMap((task): LocalTaskChoice[] => {
    if (!matches(`${task.ref} ${task.title}`)) {
      return []
    }
    const workspace = localTaskWorkspaceLinkFor(task, tasksById, args.links)
    if (
      (hostFilter !== null && workspace?.hostId !== hostFilter) ||
      (repoFilter !== null && workspace?.repoId !== repoFilter)
    ) {
      return []
    }
    return [
      {
        key: `task:${task.id}`,
        section: copy.tasks,
        label: task.title,
        subtitle: [
          task.ref,
          ...(workspace ? [workspace.nameSnapshot, hostLine(workspace.hostId)] : [copy.noWorkspace])
        ]
          .filter(Boolean)
          .join(' · '),
        disabled: workspace ? offline(workspace.hostId) : false,
        onPress: () => args.onTask(task)
      }
    ]
  })
  const hostRows = Array.from(
    new Map(args.setups.map((entry) => [entry.ownerHostId, entry])).values()
  )
    .filter((entry) => matches(hosts.name(entry.ownerHostId) || entry.ownerHostId))
    .map((entry): LocalTaskChoice => {
      const connected = hosts.connected(entry.ownerHostId)
      return {
        key: `host:${entry.ownerHostId}`,
        section: copy.hosts,
        label: hosts.name(entry.ownerHostId) || entry.ownerHostId,
        subtitle:
          entry.ownerHostId === 'local'
            ? copy.libraryHost
            : [
                copy.sshHost,
                connected === null ? null : connected ? copy.hostConnected : copy.hostNotConnected
              ]
                .filter(Boolean)
                .join(' · '),
        disabled: connected === false,
        onPress: () => args.onHost(entry.ownerHostId)
      }
    })
  return [...workspaces, ...repos, ...tasks, ...hostRows]
}
