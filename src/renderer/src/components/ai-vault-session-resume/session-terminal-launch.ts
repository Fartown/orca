import { toast } from 'sonner'
import type { AiVaultAgent, AiVaultSession } from '../../../../shared/ai-vault-types'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  buildAiVaultResumeStartupForWorktree,
  type AiVaultResumeStartup
} from '@/lib/ai-vault-resume-command'
import {
  dropDeletedSshResumeCwd,
  prepareAiVaultSessionForResume
} from '@/lib/ai-vault-session-resume-preparation'
import { activateAiVaultStructuredSession } from '@/lib/activate-ai-vault-structured-session'
import { launchAiVaultSessionInNewTab } from '@/lib/launch-ai-vault-session'
import { agentLabel } from '../right-sidebar/ai-vault-session-filters'
import type { AiVaultSessionResumeTargetState } from '../right-sidebar/ai-vault-session-resume'
import { activateAiVaultResumeWorkspace } from '../right-sidebar/ai-vault-session-resume-in-chat-launch'
import {
  aiVaultResumeUnsupportedMessage,
  resolveAiVaultSessionLaunchTarget
} from '../right-sidebar/ai-vault-session-launch-target'

export async function resumeAiVaultSession(args: {
  session: AiVaultSession
  activeWorktreeId: string | null
  targetWorktreeId?: string
  targetState: AiVaultSessionResumeTargetState
  agentCmdOverrides?: Partial<Record<AiVaultAgent, string | null>>
}): Promise<boolean> {
  if (args.session.structuredSession) {
    return activateAiVaultStructuredSession(args.session)
  }
  return launchAiVaultSessionInTerminal({
    ...args,
    prepareStartup: async (worktreeId) => {
      const preparedSession = await dropDeletedSshResumeCwd(
        await prepareAiVaultSessionForResume(args.session)
      )
      return buildAiVaultResumeStartupForWorktree({
        state: useAppStore.getState(),
        worktreeId,
        session: preparedSession,
        commandOverride: args.agentCmdOverrides?.[preparedSession.agent]
      })
    }
  })
}

export async function launchAiVaultSessionInTerminal(args: {
  session: AiVaultSession
  activeWorktreeId: string | null
  targetWorktreeId?: string
  targetState: AiVaultSessionResumeTargetState
  prepareStartup: (worktreeId: string) => Promise<AiVaultResumeStartup>
  describeFailure?: (message: string) => string
}): Promise<boolean> {
  const describeFailure = args.describeFailure ?? ((message: string) => message)
  const targetId = resolveAiVaultSessionLaunchTargetOrNotify({
    sessionFilePath: args.session.filePath,
    sessionExecutionHostId: args.session.executionHostId,
    activeWorktreeId: args.activeWorktreeId,
    targetWorktreeId: args.targetWorktreeId,
    targetState: args.targetState
  })
  if (!targetId) {
    return false
  }

  try {
    const startup = await args.prepareStartup(targetId.worktreeId)
    const launchResult = launchAiVaultSessionInNewTab({
      agent: args.session.agent,
      worktreeId: targetId.worktreeId,
      ...startup
    })
    if (launchResult.tabId === null) {
      const outcome = await launchResult.runtimeLaunch
      if (outcome.status === 'failed') {
        toast.error(
          describeFailure(outcome.message) ||
            translate(
              'auto.lib.launch.agent.in.new.tab.11cce5cc77',
              'Could not launch {{value0}} in a new terminal.',
              { value0: agentLabel(args.session.agent) }
            )
        )
        return false
      }
    }
    if (useAppStore.getState().activeWorktreeId !== targetId.worktreeId) {
      activateAiVaultResumeWorkspace(targetId.worktreeId)
    }
    toast.success(
      translate(
        'auto.components.right.sidebar.AiVaultPanel.agentSessionQueued',
        '{{value0}} session queued',
        { value0: agentLabel(args.session.agent) }
      )
    )
    return true
  } catch (error) {
    notifyAiVaultSessionPreparationFailure(error, describeFailure)
    return false
  }
}

export function notifyAiVaultSessionPreparationFailure(
  error: unknown,
  describeFailure: (message: string) => string = (message) => message
): void {
  toast.error(
    error instanceof Error
      ? describeFailure(error.message)
      : translate(
          'auto.components.right.sidebar.AiVaultPanel.prepareSessionResumeFailed',
          'Could not prepare this session for resume.'
        )
  )
}

export function resolveAiVaultSessionLaunchTargetOrNotify(
  args: Parameters<typeof resolveAiVaultSessionLaunchTarget>[0]
): Extract<ReturnType<typeof resolveAiVaultSessionLaunchTarget>, { status: 'ready' }> | null {
  const target = resolveAiVaultSessionLaunchTarget(args)
  if (target.status === 'missing') {
    toast.error(
      translate(
        'auto.components.right.sidebar.AiVaultPanel.openWorkspaceBeforeResuming',
        'Open a workspace before resuming a session.'
      )
    )
    return null
  }
  if (target.status === 'unsupported') {
    toast.error(aiVaultResumeUnsupportedMessage(target.targetStatus))
    return null
  }
  return target
}
