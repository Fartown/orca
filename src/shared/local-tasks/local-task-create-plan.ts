import type { LocalTask, LocalTaskProject } from './local-task-types'

/**
 * New task's three steps (REQ-027) as both clients decide them: which project a task working in a
 * workspace goes into, which rows can be picked, and what the primary button will do. Wording stays
 * with each client; this module only decides.
 */

/** 在哪做: a workspace that exists, a new one from a repository, or none yet. */
export type LocalTaskCreateWhere = 'existing' | 'new' | 'later'

type PlacementProject = Pick<LocalTaskProject, 'id' | 'repos'>

/** Whether a project takes tasks for a repository: one that tracks no repository takes any. */
export function localTaskProjectTakesRepo(
  project: Pick<LocalTaskProject, 'repos'>,
  orcaProjectIds: ReadonlySet<string>
): boolean {
  return project.repos.length === 0 || project.repos.some((id) => orcaProjectIds.has(id))
}

/**
 * The project a new task working in a workspace (or a new one from a repository) goes into.
 * A workspace a task already holds takes the new task as that task's subtask, so only the holder's
 * project can; a free one keeps the current project when it takes the repository, else goes to one
 * that tracks it. Null when no writable project of that library can hold the task.
 */
export function localTaskCreateProjectFor(args: {
  /** Whether a task already holds the workspace; `owner` is that task when it is loaded. */
  held: boolean
  owner: Pick<LocalTask, 'projectId'> | null
  /** The writable projects of the library that owns the workspace's host, in offered order. */
  projects: readonly PlacementProject[]
  currentProjectId: string | null
  /** The Orca projects the workspace's repository belongs to. */
  orcaProjectIds: ReadonlySet<string>
}): string | null {
  const { projects, orcaProjectIds } = args
  if (args.held) {
    const owner = args.owner
    return owner && projects.some((project) => project.id === owner.projectId)
      ? owner.projectId
      : null
  }
  const current = projects.find((project) => project.id === args.currentProjectId)
  if (current && localTaskProjectTakesRepo(current, orcaProjectIds)) {
    return current.id
  }
  const tracking = projects.find(
    (project) => orcaProjectIds.size > 0 && project.repos.some((id) => orcaProjectIds.has(id))
  )
  return tracking?.id ?? current?.id ?? projects[0]?.id ?? null
}

/** Why a workspace or repository can't be picked; out of contact only waits, nothing redials. */
export type LocalTaskCreateBlock = 'host-offline' | 'no-project'

export function localTaskCreateBlock(args: {
  /** The host owner's word on the host: false only when it says it is not connected. */
  hostConnected: boolean | null
  projectId: string | null
}): LocalTaskCreateBlock | null {
  if (args.hostConnected === false) {
    return 'host-offline'
  }
  return args.projectId === null ? 'no-project' : null
}

/** Every word of the query appears in one of the fields, ignoring case. */
export function localTaskCreateQueryMatches(
  fields: readonly (string | null | undefined)[],
  query: string
): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return true
  }
  const haystack = fields.filter(Boolean).join(' ').toLocaleLowerCase()
  return words.every((word) => haystack.includes(word))
}

/** The line the user typed first, then the task as Start sends it. */
export function localTaskKickoffPromptText(firstLine: string, taskPrompt: string): string {
  const lead = firstLine.trim()
  return lead ? `${lead}\n\n${taskPrompt}` : taskPrompt
}

/** What the primary button will do, for the line above it; names are as the user knows them. */
export type LocalTaskCreatePlan =
  | { kind: 'later' }
  | { kind: 'pick-workspace' }
  | { kind: 'pick-repo' }
  /** Agents for the target host are still being read, so the session can't be named yet. */
  | { kind: 'finding-agents' }
  | {
      kind: 'existing'
      workspace: string
      host: string
      /** Set when the workspace's task takes the new one as its subtask. */
      parentRef: string | null
      agent: string | null
    }
  | { kind: 'new'; workspace: string; host: string; agent: string | null }

export function localTaskCreatePlan(args: {
  where: LocalTaskCreateWhere
  existing: { workspace: string; host: string; parentRef: string | null } | null
  fresh: { workspace: string; host: string } | null
  /** The agent's name; null opens no session. */
  agent: string | null
  agentsPending: boolean
}): LocalTaskCreatePlan {
  if (args.where === 'later') {
    return { kind: 'later' }
  }
  if (args.where === 'existing' && !args.existing) {
    return { kind: 'pick-workspace' }
  }
  if (args.where === 'new' && !args.fresh) {
    return { kind: 'pick-repo' }
  }
  if (args.agentsPending) {
    return { kind: 'finding-agents' }
  }
  if (args.where === 'existing' && args.existing) {
    return { kind: 'existing', ...args.existing, agent: args.agent }
  }
  return args.fresh ? { kind: 'new', ...args.fresh, agent: args.agent } : { kind: 'pick-repo' }
}

/** Whether the plan can run once the task has a title. */
export function localTaskCreatePlanReady(plan: LocalTaskCreatePlan): boolean {
  return plan.kind === 'later' || plan.kind === 'existing' || plan.kind === 'new'
}

/**
 * 创建并开工 rather than 创建: work starts somewhere and a session opens there. Agents still being
 * read count as one, so the label doesn't flip while they load.
 */
export function localTaskCreateStartsSession(args: {
  where: LocalTaskCreateWhere
  agent: string | null
  agentsPending: boolean
}): boolean {
  return args.where !== 'later' && (args.agentsPending || args.agent !== null)
}
