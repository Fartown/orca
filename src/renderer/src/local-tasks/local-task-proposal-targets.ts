import type { AppState } from '@/store/types'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { normalizeExecutionHostId } from '../../../shared/execution-host'
import { normalizeDisabledTuiAgents, pickTuiAgent } from '../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { localTaskIdEndpoint, SELF_LOCAL_TASK_ENDPOINT } from './local-task-endpoints'
import { orcaProjectIdForRepo, orcaProjectIdsForWorktree } from './local-task-workspace-resolution'

/** Why a proposal item could not be placed, worded for the dispatcher that reads the result. */
export type LocalTaskProposalMiss = { miss: string }

export function isProposalMiss<T>(
  value: T | LocalTaskProposalMiss
): value is LocalTaskProposalMiss {
  return typeof value === 'object' && value !== null && 'miss' in value
}

/** Proposals live in this window's own library, so only its own projects take their tasks. */
export function ownLocalTaskProjects(projects: readonly LocalTaskProject[]): LocalTaskProject[] {
  return projects.filter((project) => localTaskIdEndpoint(project.id) === SELF_LOCAL_TASK_ENDPOINT)
}

function byName(projects: readonly LocalTaskProject[], name: string): LocalTaskProject[] {
  const wanted = name.trim().toLowerCase()
  return projects.filter(
    (project) =>
      project.name.toLowerCase() === wanted ||
      project.prefix.toLowerCase() === wanted ||
      project.aliases.some((alias) => alias.toLowerCase() === wanted)
  )
}

/**
 * The task project an item's new task goes in: the one it names, else the one whose Orca projects
 * hold its target, else the only project there is. Several candidates are a miss, never a guess.
 */
export function resolveProposalProject(
  projects: readonly LocalTaskProject[],
  named: string | undefined,
  targetOrcaProjectIds: ReadonlySet<string> | null
): LocalTaskProject | LocalTaskProposalMiss {
  const own = ownLocalTaskProjects(projects)
  if (named) {
    const found = byName(own, named)
    return found.length === 1 ? found[0] : { miss: `no single task project named "${named}"` }
  }
  const holding = targetOrcaProjectIds
    ? own.filter((project) => project.repos.some((id) => targetOrcaProjectIds.has(id)))
    : []
  if (holding.length === 1) {
    return holding[0]
  }
  if (holding.length === 0 && own.length === 1) {
    return own[0]
  }
  return { miss: 'name the task project: more than one could take this task' }
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

export function proposalWorktreeProjects(state: AppState, worktree: ProposalWorktree): Set<string> {
  return orcaProjectIdsForWorktree(state, worktree)
}

export function proposalRepoProjects(state: AppState, repoId: string): Set<string> | null {
  const repo = state.repos.find((candidate) => candidate.id === repoId)
  return repo ? new Set([orcaProjectIdForRepo(state, repo)]) : null
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
