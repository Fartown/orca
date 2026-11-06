import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  adoptAgentSessionLaunchVerdict,
  planAgentSessionLaunch
} from '@/lib/agent-session-launch-plan'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { workspaceKindForWorktreeId } from '@/lib/agent-launch-route-input'
import { launchAgentInNewTab, type LaunchAgentInNewTabResult } from '@/lib/launch-agent-in-new-tab'
import type { StructuredLaunchTerminal } from '@/lib/structured-agent-session-launch-admission'
import type { StructuredAgentLaunchSettlement } from '@/lib/structured-agent-launch-settlement'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { requestBackgroundTerminalWorktreeMount } from '@/components/terminal/background-terminal-worktree-mount'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import type { TuiAgent } from '../../../shared/tui-agent'
import { buildLocalTaskAgentPrompt } from '../../../shared/local-tasks/local-task-agent-prompt'
import { buildLocalTaskBrief } from '../../../shared/local-tasks/local-task-brief'
import { localTaskAncestors } from '../../../shared/local-tasks/local-task-tree'
import type { LocalTaskWorkspaceLink } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { localTasksDomainStore } from './local-tasks-domain-store'
import {
  localTaskWorktreeHostId,
  selectLocalTaskWorkspace
} from './local-task-workspace-resolution'
import {
  chatSessionIds,
  findChatTabForSession,
  recordLocalTaskSession,
  terminalSessionIds,
  type LocalTaskSessionTarget
} from './local-task-session-recording'

export type LocalTaskPromptDelivery = 'auto-submit' | 'draft'

/**
 * The task as the agent's prompt, with every ancestor's title for context (nearest first), and the
 * brief that tells the agent how to write its results back (REQ-022).
 */
export function localTaskPromptFor(task: LocalTask): string {
  const tasks = localTasksDomainStore.getState().tasks
  const prompt = buildLocalTaskAgentPrompt(
    task,
    localTaskAncestors(task, new Map(tasks.map((candidate) => [candidate.id, candidate])))
  )
  return `${prompt}\n\n${buildLocalTaskBrief(task.ref)}`
}

export type LocalTaskSessionLaunchArgs = {
  task: LocalTask
  link: LocalTaskWorkspaceLink
  agent: TuiAgent
  promptDelivery: LocalTaskPromptDelivery
  /** False opens the session in the background, leaving the person where they are. */
  reveal?: boolean
}

function recordTerminal(
  target: LocalTaskSessionTarget,
  terminal: LaunchAgentInNewTabResult
): StructuredLaunchTerminal {
  if (!terminal) {
    return { opened: false }
  }
  if (terminal.surface.kind === 'local-terminal') {
    void recordLocalTaskSession(target, terminalSessionIds(terminal.surface.tabId))
  } else {
    // Why: a host-published tab is named only once its host answers.
    void terminal.terminalCompletion?.then((completion) => {
      if (completion.tabId) {
        void recordLocalTaskSession(target, terminalSessionIds(completion.tabId))
      }
    })
  }
  return {
    opened: true,
    ...(terminal.surface.kind === 'local-terminal' ? { tabId: terminal.surface.tabId } : {}),
    ...(terminal.terminalCompletion ? { completion: terminal.terminalCompletion } : {}),
    ...(terminal.promptDeliveryResult
      ? { promptDeliveryResult: terminal.promptDeliveryResult }
      : {})
  }
}

function recordChat(
  target: LocalTaskSessionTarget,
  settlement: Promise<StructuredAgentLaunchSettlement>,
  provisionalTabId: string | null
): void {
  void settlement.then((settled) => {
    if (settled.kind !== 'structured' && settled.kind !== 'visibility-unknown') {
      return
    }
    const tab = findChatTabForSession(useAppStore.getState(), target.worktreeId, settled.sessionId)
    void recordLocalTaskSession(
      target,
      chatSessionIds(tab?.id ?? provisionalTabId, settled.sessionId)
    )
  })
}

/**
 * Opens an agent for a task in its workspace (REQ-010) the way Orca opens any new agent tab:
 * the route is planned first so a host that declines its chat opens this same launch as a
 * terminal here, and every surface is recorded under the task once it is named.
 */
export function launchLocalTaskSession(args: LocalTaskSessionLaunchArgs): boolean {
  const state = useAppStore.getState()
  const located = selectLocalTaskWorkspace(state, args.link)
  if (typeof located === 'string') {
    toast.error(
      located === 'missing'
        ? translate('localTasks.links.workspaceGone', 'The workspace was deleted.')
        : translate('localTasks.links.workspaceUnverifiable', 'Can’t confirm the workspace now.')
    )
    return false
  }
  const hostId = localTaskWorktreeHostId(state, located)
  if (!isLocalTaskHostInContact(state, hostId)) {
    toast.error(
      translate('localTasks.links.hostOffline', '{{host}} is not connected', {
        host: selectExecutionHostDisplayLabel(state, hostId)
      })
    )
    return false
  }
  const worktreeId = located.id
  const target: LocalTaskSessionTarget = {
    taskId: args.task.id,
    hostId,
    worktreeId,
    instanceId: located.instanceId ?? null,
    agent: args.agent,
    linkedVia: 'start'
  }
  const prompt = localTaskPromptFor(args.task)
  const { agent, promptDelivery } = args
  const reveal = args.reveal !== false
  if (reveal && activateAndRevealWorkspace(worktreeId, { executionHostId: hostId }) === false) {
    return false
  }
  // Why: a workspace this window never opened has no mounted terminals; ask for this tab's.
  const mountHidden = (terminal: LaunchAgentInNewTabResult): LaunchAgentInNewTabResult => {
    if (!reveal && terminal?.surface.kind === 'local-terminal') {
      requestBackgroundTerminalWorktreeMount({ worktreeId, tabIds: [terminal.surface.tabId] })
    }
    return terminal
  }
  const plan = planAgentSessionLaunch(useAppStore.getState(), {
    requestId: newAgentLaunchRequestId(),
    agent,
    workspace: { kind: workspaceKindForWorktreeId(worktreeId), worktreeId },
    prompt,
    promptDelivery
  })
  const result = launchAgentInNewTab({
    agent,
    worktreeId,
    prompt,
    promptDelivery,
    launchSource: 'unknown',
    ...(reveal ? {} : { activate: false }),
    agentSessionLaunchPlan: plan,
    onStructuredHostDeclined: () =>
      recordTerminal(
        target,
        mountHidden(
          launchAgentInNewTab({
            agent,
            worktreeId,
            prompt,
            promptDelivery,
            launchSource: 'unknown',
            ...(reveal ? {} : { activate: false }),
            agentSessionLaunchPlan: adoptAgentSessionLaunchVerdict({
              route: 'terminal-tui',
              requestId: plan.requestId,
              agent,
              worktreeId
            })
          })
        )
      )
  })
  if (!result) {
    toast.error(translate('localTasks.links.sessionFailed', 'The agent could not be started.'))
    return false
  }
  if (result.structuredSettlement) {
    recordChat(
      target,
      result.structuredSettlement,
      result.surface.kind === 'local-chat' ? result.surface.tabId : null
    )
  } else {
    recordTerminal(target, mountHidden(result))
  }
  return true
}
