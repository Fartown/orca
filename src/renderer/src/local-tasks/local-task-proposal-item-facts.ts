import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { getRepoExecutionHostId, normalizeExecutionHostId } from '../../../shared/execution-host'
import type { LocalTaskProposalItem } from '../../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type { LocalTaskSessionState } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { localTaskIdEndpoint } from './local-task-endpoints'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { findLocalTaskEffectiveWorkspace } from './local-task-link-selectors'
import {
  findProposalSession,
  findProposalTask,
  type ProposalDomain
} from './local-task-proposal-session-items'
import { localTaskProposalPicksProject } from './local-task-proposal-edits'
import { isProposalMiss, proposalItemProjectCandidates } from './local-task-proposal-targets'
import { selectLocalTaskSessionProgress } from './local-task-session-progress'
import {
  localTaskWorktreeHostId,
  selectLocalTaskWorkspace
} from './local-task-workspace-resolution'
import { useLocalTasksDomain, type LocalTasksDomainState } from './local-tasks-domain-store'

/** Where an item acts, as the card names it: a workspace, or a new one in a repository. */
export type LocalTaskProposalPlace = {
  kind: 'workspace' | 'new-workspace'
  name: string
  repoName: string | null
}

/** The session an append or stop acts on, as its library last judged it. */
export type LocalTaskProposalSessionFacts = {
  agent: string | null
  state: LocalTaskSessionState
  since: number | null
}

export type LocalTaskProposalItemFacts = {
  /** The host the item acts on, as this window names it; null when nothing here says. */
  hostId: string | null
  inContact: boolean
  place: LocalTaskProposalPlace | null
  session: LocalTaskProposalSessionFacts | null
  /** Task projects a start or record could go in, whether or not the item names one. */
  projectIds: string[]
}

/** Why an item cannot be confirmed now; read from the shared contact and session verdicts only. */
export type LocalTaskProposalLock =
  | { kind: 'host-offline'; hostId: string; item: 'append' | 'stop' | 'other' }
  | { kind: 'project-unpicked' }
  | { kind: 'session-ended' }
  | { kind: 'session-missing' }
  | { kind: 'session-unverifiable' }
  | { kind: 'session-busy'; state: LocalTaskSessionState; agent: string | null }

export type LocalTaskProposalItemView = {
  facts: LocalTaskProposalItemFacts
  lock: LocalTaskProposalLock | null
}

type FactsDomain = ProposalDomain &
  Pick<LocalTasksDomainState, 'progress'> & {
    tasksById: ReadonlyMap<string, LocalTask>
  }

function worktreePlace(
  app: AppState,
  target: { worktreeId: string; hostId?: string },
  withRepo: boolean
): Pick<LocalTaskProposalItemFacts, 'hostId' | 'place'> {
  const asked = normalizeExecutionHostId(target.hostId) ?? undefined
  const worktree = app.getKnownWorktreeById(target.worktreeId, asked)
  const repo = worktree && withRepo ? app.repos.find((entry) => entry.id === worktree.repoId) : null
  return {
    hostId: worktree ? localTaskWorktreeHostId(app, worktree) : (asked ?? null),
    place: {
      kind: 'workspace',
      name: worktree?.displayName ?? target.worktreeId,
      repoName: repo?.displayName ?? null
    }
  }
}

function subtaskPlace(
  app: AppState,
  domain: FactsDomain,
  parentTaskId: string
): Pick<LocalTaskProposalItemFacts, 'hostId' | 'place'> {
  const parent = findProposalTask(parentTaskId, domain)
  if (isProposalMiss(parent)) {
    return { hostId: null, place: null }
  }
  const link = findLocalTaskEffectiveWorkspace(domain.links, parent, domain.tasksById)
  if (!link) {
    return { hostId: localTaskIdEndpoint(parent.id), place: null }
  }
  const located = selectLocalTaskWorkspace(app, link)
  const worktree = typeof located === 'string' ? null : located
  const repo = worktree ? app.repos.find((entry) => entry.id === worktree.repoId) : null
  const name = worktree?.displayName ?? link.nameSnapshot
  return {
    hostId: worktree ? localTaskWorktreeHostId(app, worktree) : link.hostId,
    place: name ? { kind: 'workspace', name, repoName: repo?.displayName ?? null } : null
  }
}

function sessionFacts(
  app: AppState,
  domain: FactsDomain,
  item: { taskId: string; sessionLinkId?: string }
): LocalTaskProposalItemFacts {
  const found = findProposalSession(item, domain)
  if (isProposalMiss(found)) {
    return { hostId: null, inContact: true, place: null, session: null, projectIds: [] }
  }
  const { link } = found
  const inContact = isLocalTaskHostInContact(app, link.hostId)
  const worktree = link.worktreeId
    ? app.getKnownWorktreeById(link.worktreeId, normalizeExecutionHostId(link.hostId) ?? undefined)
    : undefined
  const progress = selectLocalTaskSessionProgress(domain, link)
  return {
    hostId: link.hostId,
    inContact,
    place: worktree ? { kind: 'workspace', name: worktree.displayName, repoName: null } : null,
    session: {
      agent: link.agent,
      // Why: a host out of contact says nothing current about its sessions.
      state: inContact ? (progress?.state ?? 'unknown') : 'unverifiable',
      since: inContact ? (progress?.stateSince ?? null) : null
    },
    projectIds: []
  }
}

export function selectLocalTaskProposalItemFacts(
  app: AppState,
  domain: FactsDomain,
  item: LocalTaskProposalItem
): LocalTaskProposalItemFacts {
  let where: Pick<LocalTaskProposalItemFacts, 'hostId' | 'place'>
  switch (item.kind) {
    case 'append':
    case 'stop':
      return sessionFacts(app, domain, item)
    case 'start':
      if ('worktreeId' in item.target) {
        where = worktreePlace(app, item.target, true)
        break
      }
      {
        const { repoId, hostId } = item.target
        const repo = app.repos.find((entry) => entry.id === repoId)
        where = {
          hostId: repo ? getRepoExecutionHostId(repo) : normalizeExecutionHostId(hostId),
          place: { kind: 'new-workspace', name: repo?.displayName ?? repoId, repoName: null }
        }
      }
      break
    case 'subtask':
      where = subtaskPlace(app, domain, item.parentTaskId)
      break
    case 'link':
    case 'record':
      where = worktreePlace(app, item.target, true)
      break
  }
  return {
    ...where,
    inContact: where.hostId === null || isLocalTaskHostInContact(app, where.hostId),
    session: null,
    projectIds: proposalItemProjectCandidates(app, domain.projects, item).map(
      (project) => project.id
    )
  }
}

/**
 * Whether the person may keep an item: a host out of contact can be neither acted on nor
 * judged, and one more instruction only goes to a session that finished a turn.
 */
export function localTaskProposalItemLock(
  item: LocalTaskProposalItem,
  facts: LocalTaskProposalItemFacts
): LocalTaskProposalLock | null {
  if (facts.hostId !== null && !facts.inContact) {
    return {
      kind: 'host-offline',
      hostId: facts.hostId,
      item: item.kind === 'append' || item.kind === 'stop' ? item.kind : 'other'
    }
  }
  if (localTaskProposalPicksProject(item) && !item.project && facts.projectIds.length > 1) {
    return { kind: 'project-unpicked' }
  }
  if (item.kind !== 'append' && item.kind !== 'stop') {
    return null
  }
  const session = facts.session
  if (!session) {
    return { kind: 'session-missing' }
  }
  switch (session.state) {
    case 'done':
      return null
    case 'exited':
      return { kind: 'session-ended' }
    case 'missing':
      return { kind: 'session-missing' }
    case 'unverifiable':
      return { kind: 'session-unverifiable' }
    case 'unknown':
      return item.kind === 'append' ? { kind: 'session-unverifiable' } : null
    case 'working':
    case 'waiting':
    case 'blocked':
    case 'idle':
      return item.kind === 'append'
        ? { kind: 'session-busy', state: session.state, agent: session.agent }
        : null
  }
}

/**
 * Facts and locks for every item of a proposal. One string-keyed read of the app store, so the
 * card re-renders only when what it shows changed, not on every agent status tick.
 */
export function useLocalTaskProposalItemViews(
  items: readonly LocalTaskProposalItem[]
): LocalTaskProposalItemView[] {
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const projects = useLocalTasksDomain((state) => state.projects)
  const links = useLocalTasksDomain((state) => state.links)
  const progress = useLocalTasksDomain((state) => state.progress)
  const domain = useMemo<FactsDomain>(
    () => ({
      tasks,
      projects,
      links,
      progress,
      tasksById: new Map(tasks.map((task) => [task.id, task]))
    }),
    [links, progress, projects, tasks]
  )
  const key = useAppStore((app) =>
    JSON.stringify(
      items.map((item): LocalTaskProposalItemView => {
        const facts = selectLocalTaskProposalItemFacts(app, domain, item)
        return { facts, lock: localTaskProposalItemLock(item, facts) }
      })
    )
  )
  return useMemo(
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: key is the JSON of the LocalTaskProposalItemView[] built just above, and JSON keeps every field of it.
    () => JSON.parse(key) as LocalTaskProposalItemView[],
    [key]
  )
}
