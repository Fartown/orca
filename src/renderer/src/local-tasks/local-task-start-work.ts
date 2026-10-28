import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { resolveLaunchAgentTabId } from '@/lib/worktree-creation-agent-seeds'
import { queueHookCommandsForFirstWorktreeTab } from '@/lib/hook-command-delayed-delivery'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { getRepoExecutionHostId, normalizeExecutionHostId } from '../../../shared/execution-host'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree/id'
import type { TuiAgent } from '../../../shared/tui-agent'
import { suggestLocalTaskWorkspaceName } from '../../../shared/local-tasks/local-task-model'
import { localTaskPromptFor } from './local-task-session-launch'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import {
  subscribeWorktreeCreationCompleted,
  type WorktreeCreationCompleted
} from './local-task-creation-events'
import { linkLocalTaskWorkspace } from './local-task-workspace-linking'
import {
  orcaProjectIdsForWorktree,
  resolveLocalTaskStartTarget
} from './local-task-workspace-resolution'
import {
  chatSessionIds,
  findChatTabForSession,
  recordLocalTaskSession,
  terminalSessionIds,
  whenAppStoreAnswers,
  type LocalTaskSessionTarget
} from './local-task-session-recording'
import { localTasksDomainStore } from './local-tasks-domain-store'

type PendingStart = {
  taskId: string
  /** The task the composer's agent session belongs to: the task, or the subtask that asked. */
  sessionTaskId: string
  /** The task project's Orca projects; a workspace made in another is not linked. Empty: any. */
  orcaProjectIds: readonly string[]
  replace: boolean
}

// Why memory only: a creation that never completes (failed, cancelled, app closed) leaves nothing.
const pendingStarts = new Map<string, PendingStart>()
const PENDING_START_LIMIT = 32

function rememberStart(creationId: string, start: PendingStart): void {
  pendingStarts.set(creationId, start)
  for (const oldest of pendingStarts.keys()) {
    if (pendingStarts.size <= PENDING_START_LIMIT) {
      break
    }
    pendingStarts.delete(oldest)
  }
}

/**
 * Opens Orca's own new-workspace composer for a task of any level (REQ-009): repo and run location
 * from the project (the default repo unless `orcaProjectId` picks another), a name from the ref
 * and title, and the task as the agent's prompt.
 */
export function startLocalTaskWork(
  task: LocalTask,
  project: LocalTaskProject,
  options: { replace?: boolean; sessionTask?: LocalTask; orcaProjectId?: string } = {}
): boolean {
  const state = useAppStore.getState()
  const start = resolveLocalTaskStartTarget(state, project, options.orcaProjectId)
  if (!start) {
    toast.error(
      translate(
        'localTasks.links.noRepo',
        'This project has no Git repository in Orca, so a workspace cannot be created for it.'
      )
    )
    return false
  }
  state.openModal('new-workspace-composer', {
    initialRepoId: start.repo.id,
    ...(state.repos.some(
      (repo) => repo.id === start.repo.id && getRepoExecutionHostId(repo) === start.target.hostId
    )
      ? {}
      : { initialTaskRepo: start.repo }),
    initialWorkspaceTarget: start.target,
    prefilledName: suggestLocalTaskWorkspaceName(task.ref, task.title),
    launchPrompt: localTaskPromptFor(options.sessionTask ?? task),
    telemetrySource: 'unknown',
    onCreationStarted: (creationId: string) =>
      rememberStart(creationId, {
        taskId: task.id,
        sessionTaskId: options.sessionTask?.id ?? task.id,
        orcaProjectIds: project.repos,
        replace: options.replace === true
      })
  })
  return true
}

function recordCreatedTerminal(
  target: LocalTaskSessionTarget,
  agent: TuiAgent,
  completed: WorktreeCreationCompleted
): void {
  const resolve = (state: AppState): string | null =>
    resolveLaunchAgentTabId(state, {
      agent,
      worktreeId: completed.worktreeId,
      primaryTabId: completed.primaryTabId,
      startupTerminalTabId: completed.startupTerminalTabId,
      backendSpawned: completed.backendSpawned
    })
  const tabId = resolve(useAppStore.getState())
  if (tabId) {
    void recordLocalTaskSession(target, terminalSessionIds(tabId))
    return
  }
  // Why: a runtime-owned workspace mirrors its tabs later; take the agent tab once it lands,
  // or the only tab, the same rule creation uses to seed that tab.
  queueHookCommandsForFirstWorktreeTab({
    worktreeId: completed.worktreeId,
    deliver: (state, firstTerminalTabId) => {
      const mirrored =
        resolve(state) ??
        ((state.tabsByWorktree[completed.worktreeId] ?? []).length === 1
          ? firstTerminalTabId
          : null)
      if (mirrored) {
        void recordLocalTaskSession(target, terminalSessionIds(mirrored))
      }
    }
  })
}

function recordCreatedChat(target: LocalTaskSessionTarget, sessionId: string): void {
  whenAppStoreAnswers(
    target.worktreeId,
    (state) => findChatTabForSession(state, target.worktreeId, sessionId),
    (tab) => void recordLocalTaskSession(target, chatSessionIds(tab.id, tab.entityId))
  )
}

async function linkCreatedWorkspace(
  start: PendingStart,
  completed: WorktreeCreationCompleted
): Promise<void> {
  const state = useAppStore.getState()
  const hostId =
    normalizeExecutionHostId(
      completed.request.workspaceRunContext?.hostId ?? completed.request.executionHostId
    ) ?? getExecutionHostIdForWorktree(state, completed.worktreeId)
  const known = state.getKnownWorktreeById(completed.worktreeId, hostId)
  const worktree = known ?? {
    id: completed.worktreeId,
    repoId: getRepoIdFromWorktreeId(completed.worktreeId)
  }
  const workspaceProjects = known ? orcaProjectIdsForWorktree(state, known) : null
  if (
    workspaceProjects &&
    start.orcaProjectIds.length > 0 &&
    !start.orcaProjectIds.some((id) => workspaceProjects.has(id))
  ) {
    // Why: the composer lets the user switch project; a task links only its own project's work.
    toast.info(
      translate(
        'localTasks.links.otherProjectNotLinked',
        'The workspace was created in another project, so it was not linked to the task.'
      )
    )
    return
  }
  const linked = await linkLocalTaskWorkspace(state, {
    taskId: start.taskId,
    worktree,
    hostId,
    linkedVia: 'start',
    replace: start.replace
  })
  const agent: TuiAgent | null = completed.request.agent
  if (!linked || !agent) {
    return
  }
  const target: LocalTaskSessionTarget = {
    taskId: start.sessionTaskId,
    hostId,
    worktreeId: completed.worktreeId,
    instanceId: known?.instanceId ?? null,
    agent,
    linkedVia: 'start'
  }
  if (completed.structuredSessionOutcome) {
    void completed.structuredSessionOutcome.then((outcome) => {
      if (outcome.kind === 'chat') {
        recordCreatedChat(target, outcome.sessionId)
      } else if (outcome.kind === 'terminal') {
        if (outcome.tabId) {
          void recordLocalTaskSession(target, terminalSessionIds(outcome.tabId))
        } else {
          recordCreatedTerminal(target, agent, completed)
        }
      }
    })
  } else if (!completed.structuredLaunchAccepted) {
    recordCreatedTerminal(target, agent, completed)
  }
}

export function handleLocalTaskCreationCompleted(completed: WorktreeCreationCompleted): void {
  const start = pendingStarts.get(completed.creationId)
  if (!start) {
    return
  }
  pendingStarts.delete(completed.creationId)
  // Why: a task deleted while its workspace was being created gets no link.
  if (!localTasksDomainStore.getState().tasks.some((task) => task.id === start.taskId)) {
    return
  }
  void linkCreatedWorkspace(start, completed)
}

export function bindLocalTaskStartWork(): () => void {
  return subscribeWorktreeCreationCompleted(handleLocalTaskCreationCompleted)
}

/** The task a creation still in flight was started for, so the sidebar can group its row. */
export function localTaskIdForCreation(creationId: string): string | null {
  return pendingStarts.get(creationId)?.taskId ?? null
}

export function resetLocalTaskStartWorkForTests(): void {
  pendingStarts.clear()
}

export { rememberStart as rememberLocalTaskStartForTests }
