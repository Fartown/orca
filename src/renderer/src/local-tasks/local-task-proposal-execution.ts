import { useAppStore } from '@/store'
import type { LocalTaskProposalItem } from '../../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type {
  LocalTaskProposal,
  LocalTaskProposalItemResult
} from '../../../shared/local-tasks/local-task-dispatcher-types'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskFailure } from '../../../shared/local-tasks/local-task-types'
import { localTaskDispatcherClient } from './local-task-dispatcher-client'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { findLocalTaskEffectiveWorkspace } from './local-task-link-selectors'
import { sendLocalTaskReply } from './local-task-needs-you-actions'
import {
  findProposalWorktree,
  isProposalMiss,
  type ProposalWorktree,
  proposalRepoProjects,
  proposalWorktreeProjects,
  resolveProposalAgent,
  resolveProposalProject,
  type LocalTaskProposalMiss
} from './local-task-proposal-targets'
import { launchLocalTaskSession } from './local-task-session-launch'
import { startLocalTaskWork } from './local-task-start-work'
import { buildLocalTaskWorkspaceLinkInput } from './local-task-workspace-linking'
import { localTasksClient } from './local-tasks-runtime-client'
import { localTasksDomainStore } from './local-tasks-domain-store'

type Outcome = Omit<LocalTaskProposalItemResult, 'index'>
type Item<K extends LocalTaskProposalItem['kind']> = Extract<LocalTaskProposalItem, { kind: K }>
/** One run of a confirmed proposal: the composer can show one new workspace at a time. */
type ProposalRun = { composerOpened: boolean }

export type LocalTaskProposalExecutors = {
  [K in LocalTaskProposalItem['kind']]: (item: Item<K>, run: ProposalRun) => Promise<Outcome>
}

const DETAIL_MAX = 500

function failed(miss: LocalTaskProposalMiss, taskId?: string): Outcome {
  return { ok: false, ...(taskId ? { taskId } : {}), detail: miss.miss }
}

/** A library write whose refusal becomes the item's result instead of a toast. */
async function write<T extends { ok: true }>(
  run: () => Promise<T | LocalTaskFailure>
): Promise<T | LocalTaskProposalMiss> {
  try {
    const result = await run()
    if (result.ok) {
      return result
    }
    return { miss: result.detail ? `${result.code} (${result.detail})` : result.code }
  } catch (error) {
    return { miss: error instanceof Error ? error.message : String(error) }
  }
}

async function createTask(
  projectId: string,
  title: string,
  description: string,
  parentId?: string
): Promise<LocalTask | LocalTaskProposalMiss> {
  const created = await write(() =>
    localTasksClient.createTask({
      projectId,
      title,
      description,
      ...(parentId ? { parentId } : {})
    })
  )
  if (isProposalMiss(created)) {
    return created
  }
  localTasksDomainStore.getState().upsertTasks([created.task], { created: true })
  return created.task
}

async function linkWorkspace(
  taskId: string,
  worktree: ProposalWorktree,
  linkedVia: 'start' | 'manual'
): Promise<LocalTaskWorkspaceLink | LocalTaskProposalMiss> {
  const input = buildLocalTaskWorkspaceLinkInput(useAppStore.getState(), {
    taskId,
    worktree,
    linkedVia
  })
  const linked = await write(() => localTasksClient.linkWorkspace(input))
  return isProposalMiss(linked) ? linked : linked.workspace
}

function launch(task: LocalTask, link: LocalTaskWorkspaceLink, asked: string | undefined): Outcome {
  const agent = resolveProposalAgent(useAppStore.getState(), asked)
  const launched =
    agent !== null &&
    launchLocalTaskSession({ task, link, agent, promptDelivery: 'auto-submit', reveal: false })
  return launched
    ? { ok: true, taskId: task.id, detail: `started ${task.ref}` }
    : {
        ok: false,
        taskId: task.id,
        detail: `created ${task.ref}; its session could not be started${agent ? '' : ' (no agent is enabled)'}`
      }
}

function taskById(taskId: string): LocalTask | undefined {
  return localTasksDomainStore.getState().tasks.find((task) => task.id === taskId)
}

/** A session of the task, on a host this window is in contact with. */
function liveSession(item: {
  taskId: string
  sessionLinkId: string
}): LocalTaskSessionLink | LocalTaskProposalMiss {
  const link = localTasksDomainStore
    .getState()
    .links.sessions.find(
      (candidate) => candidate.id === item.sessionLinkId && candidate.taskId === item.taskId
    )
  if (!link) {
    return { miss: 'the session is not linked to that task' }
  }
  return isLocalTaskHostInContact(useAppStore.getState(), link.hostId)
    ? link
    : { miss: 'the session’s host is out of contact (unverifiable)' }
}

async function runStart(item: Item<'start'>, run: ProposalRun): Promise<Outcome> {
  const state = useAppStore.getState()
  const { projects } = localTasksDomainStore.getState()
  if ('worktreeId' in item.target) {
    const worktree = findProposalWorktree(state, item.target)
    if (isProposalMiss(worktree)) {
      return failed(worktree)
    }
    const project = resolveProposalProject(
      projects,
      item.project,
      proposalWorktreeProjects(state, worktree)
    )
    if (isProposalMiss(project)) {
      return failed(project)
    }
    const task = await createTask(project.id, item.title, item.prompt)
    if (isProposalMiss(task)) {
      return failed(task)
    }
    const link = await linkWorkspace(task.id, worktree, 'start')
    return isProposalMiss(link) ? failed(link, task.id) : launch(task, link, item.agent)
  }
  const orcaProjects = proposalRepoProjects(state, item.target.repoId)
  if (!orcaProjects) {
    return failed({ miss: `repository ${item.target.repoId} is not in Orca` })
  }
  const project = resolveProposalProject(projects, item.project, orcaProjects)
  if (isProposalMiss(project)) {
    return failed(project)
  }
  const task = await createTask(project.id, item.title, item.prompt)
  if (isProposalMiss(task)) {
    return failed(task)
  }
  // Why the composer: a new workspace takes the person's choices (branch, host, setup).
  if (
    run.composerOpened ||
    !startLocalTaskWork(task, project, { orcaProjectId: [...orcaProjects][0] })
  ) {
    return { ok: false, taskId: task.id, detail: `created ${task.ref}; start it from the task` }
  }
  run.composerOpened = true
  return {
    ok: true,
    taskId: task.id,
    detail: `created ${task.ref}; the user finishes its new workspace in Orca`
  }
}

async function runSubtask(item: Item<'subtask'>): Promise<Outcome> {
  const parent = taskById(item.parentTaskId)
  if (!parent) {
    return failed({ miss: 'the parent task was not found' })
  }
  const domain = localTasksDomainStore.getState()
  const workspace = findLocalTaskEffectiveWorkspace(
    domain.links,
    parent,
    new Map(domain.tasks.map((task) => [task.id, task]))
  )
  const task = await createTask(parent.projectId, item.title, item.prompt, parent.id)
  if (isProposalMiss(task)) {
    return failed(task)
  }
  return workspace
    ? launch(task, workspace, item.agent)
    : { ok: false, taskId: task.id, detail: `created ${task.ref}; ${parent.ref} has no workspace` }
}

async function runAppend(item: Item<'append'>): Promise<Outcome> {
  const link = liveSession(item)
  if (isProposalMiss(link)) {
    return failed(link, item.taskId)
  }
  const sent = await sendLocalTaskReply(link, item.text)
  return sent.status === 'sent'
    ? { ok: true, taskId: item.taskId, detail: 'sent' }
    : failed({ miss: `not sent (${sent.status})` }, item.taskId)
}

async function runStop(item: Item<'stop'>): Promise<Outcome> {
  const link = liveSession(item)
  if (isProposalMiss(link)) {
    return failed(link, item.taskId)
  }
  const state = useAppStore.getState()
  const layout = link.tabId ? state.terminalLayoutsByTabId[link.tabId] : undefined
  if (link.surface !== 'terminal' || !link.tabId || !layout) {
    return failed({ miss: 'only an open terminal session can be stopped here' }, item.taskId)
  }
  // Why one pane only: closing a split tab would also end sessions the proposal never named.
  if (layout.root?.type !== 'leaf') {
    return failed({ miss: 'the session shares its tab; stop it there' }, item.taskId)
  }
  state.closeTab(link.tabId, { captureRecentlyClosed: true })
  return { ok: true, taskId: item.taskId, detail: 'stopped' }
}

async function runLink(item: Item<'link'>): Promise<Outcome> {
  const worktree = findProposalWorktree(useAppStore.getState(), item.target)
  if (isProposalMiss(worktree)) {
    return failed(worktree, item.taskId)
  }
  const link = await linkWorkspace(item.taskId, worktree, 'manual')
  return isProposalMiss(link)
    ? failed(link, item.taskId)
    : { ok: true, taskId: item.taskId, detail: 'linked' }
}

async function runRecord(item: Item<'record'>): Promise<Outcome> {
  const state = useAppStore.getState()
  const worktree = findProposalWorktree(state, item.target)
  if (isProposalMiss(worktree)) {
    return failed(worktree)
  }
  const project = resolveProposalProject(
    localTasksDomainStore.getState().projects,
    item.project,
    proposalWorktreeProjects(state, worktree)
  )
  if (isProposalMiss(project)) {
    return failed(project)
  }
  const task = await createTask(project.id, item.title, '')
  if (isProposalMiss(task)) {
    return failed(task)
  }
  const link = await linkWorkspace(task.id, worktree, 'manual')
  return isProposalMiss(link)
    ? failed(link, task.id)
    : { ok: true, taskId: task.id, detail: `recorded as ${task.ref}` }
}

export const LOCAL_TASK_PROPOSAL_EXECUTORS: LocalTaskProposalExecutors = {
  start: runStart,
  subtask: runSubtask,
  append: runAppend,
  stop: runStop,
  link: runLink,
  record: runRecord
}

function runItem(
  item: LocalTaskProposalItem,
  run: ProposalRun,
  executors: LocalTaskProposalExecutors
): Promise<Outcome> {
  switch (item.kind) {
    case 'start':
      return executors.start(item, run)
    case 'subtask':
      return executors.subtask(item, run)
    case 'append':
      return executors.append(item, run)
    case 'stop':
      return executors.stop(item, run)
    case 'link':
      return executors.link(item, run)
    case 'record':
      return executors.record(item, run)
  }
}

/** Runs the kept items in order and reports every outcome to the library (REQ-030). */
export async function executeLocalTaskProposal(
  proposal: LocalTaskProposal,
  executors: LocalTaskProposalExecutors = LOCAL_TASK_PROPOSAL_EXECUTORS
): Promise<LocalTaskProposalItemResult[] | null> {
  const kept = proposal.keptItemIndexes ?? proposal.items.map((_, index) => index)
  const run: ProposalRun = { composerOpened: false }
  const results: LocalTaskProposalItemResult[] = []
  for (const index of kept) {
    const item = proposal.items[index]
    if (!item) {
      continue
    }
    const outcome = await runItem(item, run, executors).catch((error: unknown): Outcome => ({
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    }))
    results.push({
      index,
      ...outcome,
      ...(outcome.detail ? { detail: outcome.detail.slice(0, DETAIL_MAX) } : {})
    })
  }
  const recorded = await write(() => localTaskDispatcherClient.recordResults(proposal.id, results))
  return isProposalMiss(recorded) ? null : results
}
