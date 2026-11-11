import { z } from 'zod'
import { projectGroupIdFromRepoId } from '../../../src/shared/folder-workspace-worktree'
import {
  localTaskCreateBlock,
  localTaskCreateProjectFor,
  localTaskCreateQueryMatches,
  type LocalTaskCreateBlock
} from '../../../src/shared/local-tasks/local-task-create-plan'
import type {
  LocalTaskLinks,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { salvagedOptional, salvagingArray } from '../../../src/shared/zod-salvage'
import type { ServedProjectSections } from '../worktree/project-sections-operations'
import {
  localTaskOrcaProjectForRepo,
  pickLocalTaskStartSetup,
  type LocalTaskSetup
} from './local-task-project-setups'
import {
  localTaskLinkHolding,
  type LocalTaskWorkspaceCandidate
} from './local-task-workspace-candidates'
import {
  localTaskWorkspaceVerdict,
  type LocalTaskWorkspaceListing,
  type LocalTaskWorkspaceReview
} from './local-task-workspace-row'

/** How New task names and judges hosts; every id here is owner-relative (`local`, `ssh:{t}`). */
export type LocalTaskCreateHosts = {
  name: (ownerHostId: string) => string
  /** The paired host's word: false only when it says the host is not connected. */
  connected: (ownerHostId: string) => boolean | null
}

/** One row of 已有工作区: what the workspace is, and where a task working there goes. */
export type LocalTaskCreateWorkspaceChoice = {
  key: string
  candidate: LocalTaskWorkspaceCandidate
  repoLabel: string
  orcaProjectId: string | null
  folder: boolean
  main: boolean
  /** The link of the task already working there; the new task becomes that task's subtask. */
  holder: LocalTaskWorkspaceLink | null
  owner: LocalTask | null
  projectId: string | null
  review: LocalTaskWorkspaceReview | null
  block: LocalTaskCreateBlock | null
}

/** One repo·host heading of 已有工作区 and its rows. */
export type LocalTaskCreateWorkspaceGroup = {
  key: string
  ownerHostId: string
  repoLabel: string
  offline: boolean
  choices: LocalTaskCreateWorkspaceChoice[]
}

/** One repository chip of 新建工作区. */
export type LocalTaskCreateRepoChoice = {
  key: string
  setup: LocalTaskSetup
  projectId: string | null
  block: LocalTaskCreateBlock | null
}

const mainRowSchema = z.looseObject({
  worktreeId: z.string(),
  isMainWorktree: salvagedOptional('isMainWorktree', z.boolean())
})

/** The workspaces a `worktree.ps` page marks as their repository's main checkout. */
export function readLocalTaskMainWorkspaceIds(rows: unknown): ReadonlySet<string> {
  const parsed = salvagingArray(mainRowSchema).safeParse(rows)
  if (!parsed.success) {
    return new Set()
  }
  return new Set(parsed.data.filter((row) => row.isMainWorktree).map((row) => row.worktreeId))
}

/** A workspace row's repository as the sidebar names it; a folder workspace by its group. */
export function localTaskCreateRepoLabel(
  catalog: ServedProjectSections | null,
  repoId: string
): string {
  if (!catalog) {
    return ''
  }
  const group = projectGroupIdFromRepoId(repoId)
  if (group) {
    return catalog.projectGroups?.find((entry) => entry.id === group)?.name ?? ''
  }
  return catalog.repos.find((repo) => repo.id === repoId)?.displayName ?? ''
}

function idSet(id: string | null): ReadonlySet<string> {
  return new Set(id ? [id] : [])
}

/**
 * Every workspace and folder workspace the library's host lists, with what New task needs to place
 * a task in it. Rows on a host out of contact stay listed and blocked; nothing is read from them.
 */
export function localTaskCreateWorkspaceChoices(args: {
  candidates: readonly LocalTaskWorkspaceCandidate[]
  listing: LocalTaskWorkspaceListing | null
  mainIds: ReadonlySet<string>
  catalog: ServedProjectSections | null
  tasks: readonly LocalTask[]
  links: LocalTaskLinks
  projects: readonly LocalTaskProject[]
  currentProjectId: string | null
  hosts: Pick<LocalTaskCreateHosts, 'connected'>
}): LocalTaskCreateWorkspaceChoice[] {
  const tasksById = new Map(args.tasks.map((task) => [task.id, task]))
  return args.candidates.map((candidate) => {
    const holder = localTaskLinkHolding(args.links, candidate)
    const owner = holder ? (tasksById.get(holder.taskId) ?? null) : null
    const orcaProjectId = args.catalog
      ? localTaskOrcaProjectForRepo(args.catalog, candidate.repoId)
      : null
    const projectId = localTaskCreateProjectFor({
      held: holder !== null,
      owner,
      projects: args.projects,
      currentProjectId: args.currentProjectId,
      orcaProjectIds: idSet(orcaProjectId)
    })
    const connected = args.hosts.connected(candidate.hostId)
    const folder = candidate.folderWorkspaceId !== null
    const verdict =
      args.listing && !folder
        ? localTaskWorkspaceVerdict(
            {
              hostId: candidate.hostId,
              kind: 'git-worktree',
              instanceId: candidate.instanceId,
              worktreeId: candidate.worktreeId,
              folderWorkspaceId: null,
              repoId: candidate.repoId
            },
            args.listing,
            connected !== false
          )
        : null
    return {
      key: `${candidate.hostId}\u0000${candidate.worktreeId}`,
      candidate,
      repoLabel: localTaskCreateRepoLabel(args.catalog, candidate.repoId),
      orcaProjectId,
      folder,
      main: args.mainIds.has(candidate.worktreeId),
      holder: owner ? holder : null,
      owner,
      projectId,
      review: verdict?.kind === 'found' ? verdict.review : null,
      block: localTaskCreateBlock({ hostConnected: connected, projectId })
    }
  })
}

/**
 * The rows matching the search, under repo·host headings: the project the form opened in first,
 * hosts out of contact last; a repository's main workspace heads its group.
 */
export function localTaskCreateWorkspaceGroups(args: {
  choices: readonly LocalTaskCreateWorkspaceChoice[]
  query: string
  /** The Orca projects of the project the form opened in. */
  firstOrcaProjectIds: readonly string[]
  hosts: LocalTaskCreateHosts
}): LocalTaskCreateWorkspaceGroup[] {
  const groups = new Map<string, { group: LocalTaskCreateWorkspaceGroup; rank: number }>()
  for (const choice of args.choices) {
    const { candidate } = choice
    const fields = [
      candidate.displayName,
      candidate.branch,
      choice.repoLabel,
      args.hosts.name(candidate.hostId),
      choice.owner?.ref
    ]
    if (!localTaskCreateQueryMatches(fields, args.query)) {
      continue
    }
    const key = `${candidate.hostId}\u0000${candidate.repoId}`
    const offline = args.hosts.connected(candidate.hostId) === false
    const entry = groups.get(key) ?? {
      group: {
        key,
        ownerHostId: candidate.hostId,
        repoLabel: choice.repoLabel,
        offline,
        choices: []
      },
      rank: offline
        ? 2
        : choice.orcaProjectId && args.firstOrcaProjectIds.includes(choice.orcaProjectId)
          ? 0
          : 1
    }
    entry.group.choices.push(choice)
    groups.set(key, entry)
  }
  return [...groups.values()]
    .map((entry, at) => ({ ...entry, at }))
    .sort((left, right) => left.rank - right.rank || left.at - right.at)
    .map(({ group }) => ({
      ...group,
      choices: [
        ...group.choices.filter((choice) => choice.main),
        ...group.choices.filter((choice) => !choice.main)
      ]
    }))
}

/**
 * The repositories a new workspace can be made from on the library's hosts: git checkouts only (a
 * folder project has nothing to create), the opened project's own first.
 */
export function localTaskCreateRepoChoices(args: {
  setups: readonly LocalTaskSetup[]
  projects: readonly LocalTaskProject[]
  currentProjectId: string | null
  firstOrcaProjectIds: readonly string[]
  hosts: Pick<LocalTaskCreateHosts, 'connected'>
}): LocalTaskCreateRepoChoice[] {
  const seen = new Set<string>()
  const rank = (setup: LocalTaskSetup) => {
    const at = args.firstOrcaProjectIds.indexOf(setup.orcaProjectId)
    return at === -1 ? args.firstOrcaProjectIds.length : at
  }
  return args.setups
    .filter((setup) => setup.kind === 'git')
    .map((setup, at) => ({ setup, at }))
    .sort((left, right) => rank(left.setup) - rank(right.setup) || left.at - right.at)
    .flatMap(({ setup }): LocalTaskCreateRepoChoice[] => {
      const key = `${setup.ownerHostId}\u0000${setup.repoId}`
      if (seen.has(key)) {
        return []
      }
      seen.add(key)
      const projectId = localTaskCreateProjectFor({
        held: false,
        owner: null,
        projects: args.projects,
        currentProjectId: args.currentProjectId,
        orcaProjectIds: idSet(setup.orcaProjectId)
      })
      const hostConnected = args.hosts.connected(setup.ownerHostId)
      return [{ key, setup, projectId, block: localTaskCreateBlock({ hostConnected, projectId }) }]
    })
}

/**
 * The repository 新建工作区 starts on: Start's own default among the project's usable checkouts, or
 * any usable one for a project tracking none. None otherwise, so a pick never moves the project.
 */
export function localTaskCreateDefaultRepo(
  choices: readonly LocalTaskCreateRepoChoice[],
  project: LocalTaskProject | null
): LocalTaskCreateRepoChoice | null {
  if (!project) {
    return null
  }
  const usable = choices.filter((choice) => choice.block === null)
  const own =
    project.repos.length === 0
      ? usable
      : usable.filter((choice) => project.repos.includes(choice.setup.orcaProjectId))
  const setup = pickLocalTaskStartSetup(
    own.map((choice) => choice.setup),
    project
  )
  return own.find((choice) => choice.setup === setup) ?? null
}
