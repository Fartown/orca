import { translate } from '@/i18n/i18n'
import { getAgentLabel } from '@/lib/agent-catalog'
import { useAppStore } from '@/store'
import type { TuiAgent } from '../../../shared/tui-agent'
import { isTuiAgent } from '../../../shared/tui-agent-config'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskCreateWorkspaceChoice } from './local-task-create-workspace-choices'
import type { LocalTaskCreateDefaults } from './local-task-page-store'
import {
  launchLocalTaskSession,
  localTaskPromptFor,
  type LocalTaskPromptDelivery
} from './local-task-session-launch'
import {
  chatSessionIds,
  recordLocalTaskSession,
  terminalSessionIds
} from './local-task-session-recording'
import {
  buildLocalTaskWorkspaceLinkInput,
  linkLocalTaskWorkspace
} from './local-task-workspace-linking'
import { localTaskWorktreeHostId } from './local-task-workspace-resolution'
import { localTasksClient } from './local-tasks-runtime-client'
import { runLocalTaskWrite } from './local-task-writes'

export type LocalTaskCreateKickoff = {
  choice: LocalTaskCreateWorkspaceChoice
  /** Null: link the workspace and open no session. */
  agent: TuiAgent | null
  firstLine: string
  delivery: LocalTaskPromptDelivery
}

/** The first line the user typed, then the task as Start sends it (with the brief unless off). */
export function localTaskKickoffPrompt(task: LocalTask, firstLine: string): string {
  const lead = firstLine.trim()
  const body = localTaskPromptFor(task)
  return lead ? `${lead}\n\n${body}` : body
}

/**
 * Puts a task that was just created to work in an existing workspace (REQ-027): links the
 * workspace, unless the task works in its owner's as that owner's subtask, then opens the session
 * there without leaving the task view. The task stays whatever fails; each step says why itself.
 */
export async function kickOffCreatedLocalTask(
  task: LocalTask,
  kickoff: LocalTaskCreateKickoff
): Promise<boolean> {
  const { choice, agent } = kickoff
  let link = choice.ownerLink
  if (!link) {
    const linked = await runLocalTaskWrite(() =>
      localTasksClient.linkWorkspace(
        buildLocalTaskWorkspaceLinkInput(useAppStore.getState(), {
          taskId: task.id,
          worktree: choice.candidate.worktree,
          linkedVia: 'manual'
        })
      )
    )
    link = linked?.workspace ?? null
  }
  if (!link || !agent) {
    return link !== null
  }
  return launchLocalTaskSession({
    task,
    link,
    agent,
    promptDelivery: kickoff.delivery,
    prompt: localTaskKickoffPrompt(task, kickoff.firstLine),
    reveal: false
  })
}

/** How 记成任务 names the running session: its agent, else its surface. */
export function localTaskSourceSessionName(
  source: NonNullable<LocalTaskCreateDefaults['source']>
): string {
  if (isTuiAgent(source.agent)) {
    return getAgentLabel(source.agent)
  }
  return source.sessionId
    ? translate('localTasks.links.surfaceChat', 'Chat')
    : translate('localTasks.links.surfaceTerminal', 'Terminal')
}

/** 记成任务: the running session's workspace and the session itself go under the new task. */
export async function linkCreatedLocalTaskToSession(
  task: LocalTask,
  source: NonNullable<LocalTaskCreateDefaults['source']>
): Promise<void> {
  const { worktree, paneKey, agent, sessionId, tabId } = source
  const linked = await linkLocalTaskWorkspace(useAppStore.getState(), {
    taskId: task.id,
    worktree,
    linkedVia: 'manual'
  })
  const pane = parsePaneKey(paneKey)
  const ids = sessionId
    ? chatSessionIds(tabId ?? null, sessionId)
    : pane
      ? { ...terminalSessionIds(pane.tabId), paneKey }
      : null
  if (!linked || !ids) {
    return
  }
  await recordLocalTaskSession(
    {
      taskId: task.id,
      worktreeId: worktree.id,
      instanceId: worktree.instanceId ?? null,
      hostId: localTaskWorktreeHostId(useAppStore.getState(), worktree),
      agent: isTuiAgent(agent) ? agent : null,
      linkedVia: 'manual'
    },
    ids
  )
}
