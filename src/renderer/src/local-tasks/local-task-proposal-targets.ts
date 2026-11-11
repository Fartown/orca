import type { AppState } from '@/store/types'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { getRepoExecutionHostId, normalizeExecutionHostId } from '../../../shared/execution-host'
import { normalizeDisabledTuiAgents, pickTuiAgent } from '../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { LocalTaskProposalItem } from '../../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type { LocalTaskLinks } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { findLocalTaskLinkForWorkspace } from '../../../shared/local-tasks/local-task-workspace-match'
import {
  localTaskEndpointForHost,
  localTaskIdEndpoint,
  SELF_LOCAL_TASK_ENDPOINT,
  type LocalTaskEndpointKey
} from './local-task-endpoints'
import {
  localTaskWorktreeHostId,
  orcaProjectIdForRepo,
  orcaProjectIdsForWorktree
} from './local-task-workspace-resolution'

/** Why a proposal item could not be placed, worded for the dispatcher that reads the result. */
export type LocalTaskProposalMiss = { miss: string }

export function isProposalMiss<T>(
  value: T | LocalTaskProposalMiss
): value is LocalTaskProposalMiss {
  return typeof value === 'object' && value !== null && 'miss' in value
}

/**
 * A task goes in the library of the Orca that owns its workspace (D-008): this window's own for
 * its hosts and SSH relays, a managed SSH host's or paired server's for theirs.
 */
export function proposalLibraryFor(hostId: string | null): LocalTaskEndpointKey {
  return (hostId ? localTaskEndpointForHost(hostId) : null) ?? SELF_LOCAL_TASK_ENDPOINT
}

export function projectsOfLibrary(
  projects: readonly LocalTaskProject[],
  library: LocalTaskEndpointKey
): LocalTaskProject[] {
  return projects.filter((project) => localTaskIdEndpoint(project.id) === library)
}

/** Whether an item's `project` names this task project, by name, prefix or alias. */
export function proposalProjectIsNamed(project: LocalTaskProject, name: string): boolean {
  const wanted = name.trim().toLowerCase()
  return (
    project.name.toLowerCase() === wanted ||
    project.prefix.toLowerCase() === wanted ||
    project.aliases.some((alias) => alias.toLowerCase() === wanted)
  )
}

/**
 * The task projects an unnamed item's new task could go in: those whose Orca projects hold its
 * target, else the only project there is. One is taken; several must be named, never guessed.
 */
export function proposalProjectCandidates(
  projects: readonly LocalTaskProject[],
  targetOrcaProjectIds: ReadonlySet<string> | null,
  library: LocalTaskEndpointKey = SELF_LOCAL_TASK_ENDPOINT
): LocalTaskProject[] {
  const own = projectsOfLibrary(projects, library)
  const holding = targetOrcaProjectIds
    ? own.filter((project) => project.repos.some((id) => targetOrcaProjectIds.has(id)))
    : []
  if (holding.length > 0) {
    return holding
  }
  if (own.length === 1) {
    return own
  }
  return targetOrcaProjectIds ? [] : own
}

/** The task project an item's new task goes in: the one it names, else its only candidate. */
export function resolveProposalProject(
  projects: readonly LocalTaskProject[],
  named: string | undefined,
  targetOrcaProjectIds: ReadonlySet<string> | null,
  library: LocalTaskEndpointKey = SELF_LOCAL_TASK_ENDPOINT
): LocalTaskProject | LocalTaskProposalMiss {
  if (named) {
    const found = projectsOfLibrary(projects, library).filter((project) =>
      proposalProjectIsNamed(project, named)
    )
    return found.length === 1 ? found[0] : { miss: `no single task project named "${named}"` }
  }
  const candidates = proposalProjectCandidates(projects, targetOrcaProjectIds, library)
  if (candidates.length === 1) {
    return candidates[0]
  }
  return candidates.length === 0
    ? { miss: 'no task project here tracks this repository; ask the user to set one up' }
    : {
        // Why the prefixes: the dispatcher reads this in its inbox and can resubmit with one.
        miss: `name the task project: more than one could take this task (${candidates
          .map((project) => project.prefix)
          .join(', ')})`
      }
}

/** A workspace row this window lists, as the composer's creations hand it over. */
export type ProposalWorktree = NonNullable<ReturnType<AppState['getKnownWorktreeById']>>

/** A workspace an item names, as this window knows it. */
export function findProposalWorktree(
  state: AppState,
  target: { worktreeId: string; hostId?: string }
): ProposalWorktree | LocalTaskProposalMiss {
  const hostId = normalizeExecutionHostId(target.hostId) ?? undefined
  return (
    state.getKnownWorktreeById(target.worktreeId, hostId) ?? {
      miss: `workspace ${target.worktreeId} is not known`
    }
  )
}

/** The Orca projects a target sits in and the library its new task belongs in. */
export type ProposalProjectScope = {
  orcaProjectIds: ReadonlySet<string>
  library: LocalTaskEndpointKey
}

export function proposalWorktreeScope(
  state: AppState,
  worktree: ProposalWorktree
): ProposalProjectScope {
  return {
    orcaProjectIds: orcaProjectIdsForWorktree(state, worktree),
    library: proposalLibraryFor(localTaskWorktreeHostId(state, worktree))
  }
}

/** A repository's scope from the host it runs on; null when this window does not list it. */
export function proposalRepoScope(state: AppState, repoId: string): ProposalProjectScope | null {
  const repo = state.repos.find((candidate) => candidate.id === repoId)
  return repo
    ? {
        orcaProjectIds: new Set([orcaProjectIdForRepo(state, repo)]),
        library: proposalLibraryFor(getRepoExecutionHostId(repo))
      }
    : null
}

function proposalItemScope(
  state: AppState,
  item: LocalTaskProposalItem
): ProposalProjectScope | null {
  const target = item.kind === 'start' || item.kind === 'record' ? item.target : null
  if (!target) {
    return null
  }
  if ('repoId' in target) {
    return proposalRepoScope(state, target.repoId)
  }
  const worktree = findProposalWorktree(state, target)
  return isProposalMiss(worktree) ? null : proposalWorktreeScope(state, worktree)
}

/**
 * The task projects a start or record could put its new task in, read from this window's own rows
 * by the rule the run uses; empty for other kinds and for targets this window does not list.
 */
export function proposalItemProjectCandidates(
  state: AppState,
  projects: readonly LocalTaskProject[],
  item: LocalTaskProposalItem
): LocalTaskProject[] {
  const scope = proposalItemScope(state, item)
  return scope ? proposalProjectCandidates(projects, scope.orcaProjectIds, scope.library) : []
}

/** The agent an item asks for when it is installed and on, else the user's default. */
export function resolveProposalAgent(state: AppState, asked: string | undefined): TuiAgent | null {
  const catalog = getAgentCatalog().map((entry) => entry.id)
  const disabled = state.settings?.disabledTuiAgents
  const named = catalog.find((id) => id === asked)
  const disabledSet = new Set(normalizeDisabledTuiAgents(disabled))
  return named && !disabledSet.has(named)
    ? named
    : pickTuiAgent(state.settings?.defaultTuiAgent, catalog, disabled)
}

/** The agent a new session of an item opens with, and whether it stands in for the one asked. */
export function proposalLaunchAgent(
  state: AppState,
  asked: string | undefined
): { agent: TuiAgent | null; substituted: boolean } {
  const agent = resolveProposalAgent(state, asked)
  return { agent, substituted: asked !== undefined && agent !== asked }
}

/**
 * The task a workspace already belongs to, from this window's links. A workspace belongs to one
 * task, so a start or record there would leave its new task without one.
 */
export function proposalWorkspaceOwner(
  state: AppState,
  domain: { tasks: readonly LocalTask[]; links: LocalTaskLinks },
  worktree: Pick<ProposalWorktree, 'id' | 'hostId' | 'instanceId'>
): LocalTask | null {
  const link = findLocalTaskLinkForWorkspace(domain.links, {
    id: worktree.id,
    hostId: localTaskWorktreeHostId(state, worktree),
    ...(worktree.instanceId ? { instanceId: worktree.instanceId } : {})
  })
  return link ? (domain.tasks.find((task) => task.id === link.taskId) ?? null) : null
}

/**
 * Why an item cannot go in a workspace another task owns, worded for the dispatcher; checked
 * before a task is made, since the link would be refused and leave that task without one.
 */
export function proposalWorkspaceOwnedMiss(
  state: AppState,
  domain: { tasks: readonly LocalTask[]; links: LocalTaskLinks },
  worktree: Pick<ProposalWorktree, 'id' | 'hostId' | 'instanceId'>,
  taskId?: string
): LocalTaskProposalMiss | null {
  const owner = proposalWorkspaceOwner(state, domain, worktree)
  return owner && owner.id !== taskId
    ? { miss: `the workspace already belongs to ${owner.ref}; a workspace belongs to one task` }
    : null
}

/** Why a start or subtask cannot run with no agent enabled; checked before its task is made. */
export function proposalNoAgentMiss(
  state: AppState,
  asked: string | undefined
): LocalTaskProposalMiss | null {
  return resolveProposalAgent(state, asked) === null
    ? { miss: 'no agent is enabled; ask the user to turn one on in Settings, Agents' }
    : null
}
