import { useState } from 'react'
import {
  localTaskCreatePlan,
  localTaskCreatePlanReady,
  localTaskCreateStartsSession,
  type LocalTaskCreateWhere
} from '../../../src/shared/local-tasks/local-task-create-plan'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { TuiAgent } from '../../../src/shared/tui-agent'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import {
  localTaskCreateDefaultRepo,
  localTaskCreateRepoChoices,
  localTaskCreateWorkspaceChoices,
  localTaskCreateWorkspaceGroups,
  type LocalTaskCreateHosts,
  type LocalTaskCreateRepoChoice,
  type LocalTaskCreateWorkspaceChoice
} from './local-task-create-choices'
import { localTaskCreateCopy } from './local-task-create-copy'
import {
  kickOffCreatedLocalTask,
  localTaskCreateKickoffBlocked,
  type LocalTaskCreateKickoff
} from './local-task-create-kickoff'
import { localTaskListedHostId, type LocalTaskSite } from './local-task-endpoint'
import type { LocalTaskDraft } from './local-task-form-state'
import { localTaskHostLabel } from './local-task-launch-sheet'
import { createLocalTaskOperationIds } from './local-task-operation-ids'
import { localTaskSetupsFor } from './local-task-project-setups'
import { useLocalTaskCreateAgents } from './use-local-task-create-agents'
import { useLocalTaskCreateWorkspaces } from './use-local-task-create-workspaces'
import { useLocalTaskHostDirectory } from './use-local-task-host-labels'
import { useLocalTaskProjectCatalog } from './use-local-task-project-catalog'
import type { LocalTasksLibrary } from './use-local-tasks-library'

/** What the form runs around its create when work starts somewhere. */
export type LocalTaskCreateKickoffRun = {
  /** Why nothing should be created now, asked before the create. */
  blocked: () => Promise<string | null>
  /** After the create: what to tell the user, or null when it all went through. */
  run: (task: LocalTask) => Promise<string | null>
}

/** A draft moved to another project: status and parent belong to the old one. */
function inProject(draft: LocalTaskDraft, projectId: string | null): Partial<LocalTaskDraft> {
  return projectId && projectId !== draft.projectId
    ? { projectId, statusId: null, parentId: null }
    : {}
}

/**
 * New task's 在哪做 and 开工 (m8): the library host's workspaces and repositories, the agents on
 * the picked host, and the kickoff the form runs after creating. Without the library's host in
 * contact both steps stay at 稍后再定 and say why; contact coming back is what reads again.
 */
export function useLocalTaskCreateWhere(args: {
  active: boolean
  site: LocalTaskSite | undefined
  api: LocalTasksApi
  library: LocalTasksLibrary
  openedProjectId: string
  draft: LocalTaskDraft
  patch: (next: Partial<LocalTaskDraft>) => void
}) {
  const create = localTaskCreateCopy()
  const { library, draft } = args
  const site = args.site ?? null
  const inContact = site?.connState === 'connected'
  const unavailable = !args.active
    ? null
    : !site
      ? create.noSite
      : !inContact
        ? create.libraryOffline(site.label)
        : null
  const reading = args.active && site !== null && inContact
  const [whereChoice, setWhereChoice] = useState<LocalTaskCreateWhere>('existing')
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const [repoKey, setRepoKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [agentChoice, setAgentChoice] = useState<TuiAgent | 'none' | null>(null)
  const [firstLine, setFirstLine] = useState(() => create.firstLineDefault)
  const [ids] = useState(() => ({
    link: createLocalTaskOperationIds(),
    record: createLocalTaskOperationIds()
  }))

  const catalog = useLocalTaskProjectCatalog(reading ? site.pairedClient : null)
  const workspaces = useLocalTaskCreateWorkspaces(
    reading ? site.client : null,
    site ? (site.endpoint.executionHost ?? site.hostId) : ''
  )
  const ready = catalog.state === 'ready' ? catalog.catalog : null
  const setups = ready && site ? localTaskSetupsFor(ready, site.endpoint, []) : []
  const candidates = workspaces.status === 'ready' ? workspaces.candidates : []
  const listed = (ownerHostId: string) =>
    (site ? localTaskListedHostId(site.endpoint, ownerHostId) : null) ?? ownerHostId
  const directory = useLocalTaskHostDirectory(reading ? site.pairedClient : null, [
    ...setups.map((setup) => setup.hostId),
    ...candidates.map((candidate) => listed(candidate.hostId))
  ])
  const hosts: LocalTaskCreateHosts = {
    name: (ownerHostId) =>
      ownerHostId === 'local' && site
        ? site.label
        : (directory.labels.get(listed(ownerHostId)) ??
          localTaskHostLabel(listed(ownerHostId), null)),
    connected: (ownerHostId) =>
      ownerHostId === 'local' ? null : (directory.connected.get(listed(ownerHostId)) ?? null)
  }

  const opened = library.projects.find((project) => project.id === args.openedProjectId) ?? null
  const current = library.projects.find((project) => project.id === draft.projectId) ?? null
  const firstOrcaProjectIds = opened?.repos ?? []
  const choices = localTaskCreateWorkspaceChoices({
    candidates,
    listing: workspaces.status === 'ready' ? workspaces.listing : null,
    mainIds: workspaces.status === 'ready' ? workspaces.mainIds : new Set(),
    catalog: ready,
    tasks: library.tasks,
    links: library.work.links,
    projects: library.projects,
    currentProjectId: draft.projectId,
    hosts
  })
  const groups = localTaskCreateWorkspaceGroups({ choices, query, firstOrcaProjectIds, hosts })
  const picked = choices.find((choice) => choice.key === pickedKey && choice.block === null) ?? null
  const repos = localTaskCreateRepoChoices({
    setups,
    projects: library.projects,
    currentProjectId: draft.projectId,
    firstOrcaProjectIds,
    hosts
  })
  const repo =
    repos.find((choice) => choice.key === repoKey && choice.block === null) ??
    localTaskCreateDefaultRepo(repos, current)

  const where: LocalTaskCreateWhere = unavailable ? 'later' : whereChoice
  const targetHostId =
    where === 'existing'
      ? (picked?.holder?.hostId ?? picked?.candidate.hostId ?? null)
      : where === 'new'
        ? (repo?.setup.ownerHostId ?? null)
        : null
  const agents = useLocalTaskCreateAgents(reading ? site : null, targetHostId)
  const options = agents.status === 'ready' ? agents.agents : []
  const agent: TuiAgent | null =
    agentChoice === 'none'
      ? null
      : ((options.find((option) => option.agent === agentChoice) ?? options[0])?.agent ?? null)
  const agentsPending = agentChoice !== 'none' && agents.status === 'loading' && !!targetHostId
  const agentLabel = options.find((option) => option.agent === agent)?.label ?? null
  const plan = localTaskCreatePlan({
    where,
    existing: picked
      ? {
          workspace: picked.candidate.displayName,
          host: hosts.name(picked.holder?.hostId ?? picked.candidate.hostId),
          parentRef: picked.owner?.ref ?? null
        }
      : null,
    fresh: repo
      ? { workspace: workspaceName.trim(), host: hosts.name(repo.setup.ownerHostId) }
      : null,
    agent: agentLabel,
    agentsPending
  })

  const ownerOf = (choice: LocalTaskCreateWorkspaceChoice | null) => choice?.owner ?? null
  // Why the project follows the pick: a workspace's task takes the new one as its subtask, and a
  // free workspace's repository says which project tracks it.
  const pickWorkspace = (choice: LocalTaskCreateWorkspaceChoice) => {
    if (choice.block !== null) {
      return
    }
    setPickedKey(choice.key)
    const owner = ownerOf(choice)
    const moved = inProject(draft, choice.projectId)
    const previousOwner = ownerOf(picked)
    args.patch({
      ...moved,
      ...(owner
        ? { parentId: owner.id }
        : previousOwner && draft.parentId === previousOwner.id
          ? { parentId: null }
          : {})
    })
  }
  const pickRepo = (choice: LocalTaskCreateRepoChoice) => {
    if (choice.block !== null) {
      return
    }
    setRepoKey(choice.key)
    args.patch(inProject(draft, choice.projectId))
  }
  const changeWhere = (next: LocalTaskCreateWhere) => {
    setWhereChoice(next)
    const owner = ownerOf(picked)
    if (next === 'existing' && picked) {
      args.patch({
        ...inProject(draft, picked.projectId),
        ...(owner ? { parentId: owner.id } : {})
      })
    } else if (owner && draft.parentId === owner.id) {
      args.patch({ parentId: null })
    }
    if (next === 'new' && repoKey && repo) {
      args.patch(inProject(draft, repo.projectId))
    }
  }
  /** A picker's own change: another project or parent no longer works in the owner's workspace. */
  const draftChanged = (next: Partial<LocalTaskDraft>) => {
    const owner = ownerOf(picked)
    const leavesOwner =
      owner &&
      ((next.projectId !== undefined && next.projectId !== owner.projectId) ||
        (next.parentId !== undefined && next.parentId !== owner.id))
    if (leavesOwner) {
      setPickedKey(null)
    }
  }

  const kickoff: LocalTaskCreateKickoff | null =
    plan.kind === 'existing' && picked
      ? {
          target: {
            kind: 'existing',
            candidate: picked.candidate,
            holder: picked.holder,
            hostLabel: plan.host
          },
          agent,
          firstLine
        }
      : plan.kind === 'new' && repo
        ? {
            target: {
              kind: 'new',
              ownerHostId: repo.setup.ownerHostId,
              repoId: repo.setup.repoId,
              name: workspaceName.trim(),
              hostLabel: plan.host
            },
            agent,
            firstLine
          }
        : null
  const words = { copy: localTasksCopy(), create }
  const run: LocalTaskCreateKickoffRun | null =
    kickoff && site
      ? {
          blocked: () =>
            localTaskCreateKickoffBlocked({
              client: site.client,
              endpoint: site.endpoint,
              kickoff,
              words
            }),
          run: async (task) => {
            if (!site.client) {
              return create.createdNotStarted(task.ref, words.copy.work.hostUnknown)
            }
            const message = await kickOffCreatedLocalTask({
              client: site.client,
              capabilities: site.capabilities,
              api: args.api,
              ids,
              task,
              tasks: library.tasks,
              brief: library.status?.taskBrief ?? true,
              kickoff,
              words
            })
            library.reload(['links'])
            return message
          }
        }
      : null

  return {
    unavailable,
    where,
    changeWhere,
    workspaces: workspaces.status,
    groups,
    hasWorkspaces: candidates.length > 0,
    picked,
    pickWorkspace,
    query,
    setQuery,
    catalog: catalog.state,
    repos,
    repo,
    pickRepo,
    workspaceName,
    setWorkspaceName,
    hosts,
    targetHostName: targetHostId ? hosts.name(targetHostId) : '',
    agents,
    agent,
    agentChoice,
    setAgentChoice,
    firstLine,
    setFirstLine,
    briefOn: library.status?.taskBrief !== false,
    plan,
    planReady: localTaskCreatePlanReady(plan),
    startsSession: localTaskCreateStartsSession({ where, agent: agentLabel, agentsPending }),
    projectFollows:
      (where === 'existing' && picked !== null) || (where === 'new' && repoKey !== null),
    draftChanged,
    kickoff: run
  }
}

export type LocalTaskCreateWhereState = ReturnType<typeof useLocalTaskCreateWhere>
