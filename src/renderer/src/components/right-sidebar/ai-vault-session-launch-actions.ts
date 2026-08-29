import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import {
  buildAiVaultResumeCopyCommandForWorktree,
  buildAiVaultResumeStartupForWorktree
} from '@/lib/ai-vault-resume-command'
import { launchAiVaultSessionInNewTab } from '@/lib/launch-ai-vault-session'
import { useAppStore } from '@/store'
import { getAiVaultResumeWorkspaceExecutionHostId } from '@/lib/ai-vault-resume-target'
import type { AiVaultAgent, AiVaultSession } from '../../../../shared/ai-vault-types'
import { prepareAiVaultSessionForResume } from '@/lib/ai-vault-session-resume-preparation'
import type { Worktree } from '../../../../shared/worktree/types'
import { translate } from '@/i18n/i18n'
import { agentLabel } from './ai-vault-session-filters'
import type { AiVaultSessionResumeTargetState } from './ai-vault-session-resume'
import { prepareAiVaultSessionContinuation } from './ai-vault-session-continuation'
import type { AgentSessionContinuationRequest } from '@/lib/agent-session-continuation'
import {
  observeResumedConversationLocalLaunch,
  recordResumedConversation,
  recordResumedConversationLaunchFailure,
  type ResumedConversationBookkeeping
} from '@/issues/issue-resume-bookkeeping'
import {
  activateAiVaultResumeWorkspace,
  resolveAiVaultSessionLaunchTargetOrNotify,
  resolveAiVaultTargetWorkspacePath,
  workspaceDisplayName,
  workspaceScopeForIssueResume
} from './ai-vault-session-launch-target'
import { activateAiVaultStructuredSession } from '@/lib/activate-ai-vault-structured-session'

export { resolveAiVaultSessionLaunchTarget } from './ai-vault-session-launch-target'

export type AiVaultSessionResumeLaunchResult = {
  launched: boolean
  bookkeeping: ResumedConversationBookkeeping
}

export async function resumeAiVaultSession(args: {
  session: AiVaultSession
  activeWorktreeId: string | null
  targetWorktreeId?: string
  targetState: AiVaultSessionResumeTargetState
  agentCmdOverrides?: Partial<Record<AiVaultAgent, string | null>>
}): Promise<AiVaultSessionResumeLaunchResult> {
  if (args.session.structuredSession) {
    return {
      launched: await activateAiVaultStructuredSession(args.session),
      bookkeeping: { recorded: false }
    }
  }

  const targetId = resolveAiVaultSessionLaunchTargetOrNotify({
    sessionFilePath: args.session.filePath,
    sessionExecutionHostId: args.session.executionHostId,
    activeWorktreeId: args.activeWorktreeId,
    targetWorktreeId: args.targetWorktreeId,
    targetState: args.targetState
  })
  if (!targetId) {
    return { launched: false, bookkeeping: { recorded: false } }
  }

  let bookkeeping: ResumedConversationBookkeeping = { recorded: false }
  try {
    const preparedSession = await prepareAiVaultSessionForResume(args.session)
    const startup = buildAiVaultResumeStartupForWorktree({
      state: useAppStore.getState(),
      worktreeId: targetId.worktreeId,
      session: preparedSession,
      commandOverride: args.agentCmdOverrides?.[preparedSession.agent]
    })
    const launchToken = crypto.randomUUID()
    if (startup.providerSession) {
      const state = useAppStore.getState()
      bookkeeping = await recordResumedConversation({
        executionHostId: getAiVaultResumeWorkspaceExecutionHostId(
          args.targetState,
          targetId.worktreeId
        ),
        launchToken,
        workspaceRef: workspaceScopeForIssueResume(targetId.worktreeId),
        workspaceSnapshot: {
          name: workspaceDisplayName(state, targetId.worktreeId),
          path: resolveAiVaultTargetWorkspacePath(args.targetState, targetId.worktreeId)
        },
        agent: preparedSession.agent,
        providerSession: startup.providerSession
      })
    }
    const launchResult = launchAiVaultSessionInNewTab({
      agent: preparedSession.agent,
      worktreeId: targetId.worktreeId,
      ...startup,
      launchToken
    })
    if (launchResult.tabId === null) {
      const outcome = await launchResult.runtimeLaunch
      if (outcome.status === 'failed') {
        const failure =
          outcome.message ||
          translate(
            'auto.lib.launch.agent.in.new.tab.11cce5cc77',
            'Could not launch {{value0}} in a new terminal.',
            { value0: agentLabel(preparedSession.agent) }
          )
        await recordResumedConversationLaunchFailure(bookkeeping, failure)
        toast.error(failure)
        return { launched: false, bookkeeping }
      }
    } else {
      observeResumedConversationLocalLaunch(bookkeeping, {
        worktreeId: targetId.worktreeId,
        tabId: launchResult.tabId
      })
    }

    if (useAppStore.getState().activeWorktreeId !== targetId.worktreeId) {
      activateAiVaultResumeWorkspace(targetId.worktreeId)
    }
    toast.success(
      translate(
        'auto.components.right.sidebar.AiVaultPanel.agentSessionQueued',
        '{{value0}} session queued',
        { value0: agentLabel(preparedSession.agent) }
      )
    )
    return { launched: true, bookkeeping }
  } catch (error) {
    await recordResumedConversationLaunchFailure(
      bookkeeping,
      error instanceof Error ? error.message : String(error)
    )
    notifyAiVaultSessionPreparationFailure(error)
    return { launched: false, bookkeeping }
  }
}

export function useAiVaultSessionLaunchActions({
  activeWorktree,
  activeWorktreeId,
  targetState,
  agentCmdOverrides
}: {
  activeWorktree: Worktree | null
  activeWorktreeId: string | null
  targetState: AiVaultSessionResumeTargetState
  agentCmdOverrides?: Partial<Record<AiVaultAgent, string | null>>
}) {
  const [continuationRequest, setContinuationRequest] =
    useState<AgentSessionContinuationRequest | null>(null)

  const buildResumeCommand = useCallback(
    (session: AiVaultSession, worktreeId?: string | null): string =>
      buildAiVaultResumeCopyCommandForWorktree({
        state: useAppStore.getState(),
        worktreeId: worktreeId ?? activeWorktreeId ?? activeWorktree?.id ?? null,
        session,
        commandOverride: agentCmdOverrides?.[session.agent]
      }),
    [activeWorktree?.id, activeWorktreeId, agentCmdOverrides]
  )

  const buildResumeStartup = useCallback(
    (session: AiVaultSession, worktreeId?: string | null) =>
      buildAiVaultResumeStartupForWorktree({
        state: useAppStore.getState(),
        worktreeId: worktreeId ?? activeWorktreeId ?? activeWorktree?.id ?? null,
        session,
        commandOverride: agentCmdOverrides?.[session.agent]
      }),
    [activeWorktree?.id, activeWorktreeId, agentCmdOverrides]
  )

  const copyResumeCommand = useCallback(
    async (session: AiVaultSession, worktreeId?: string | null): Promise<void> => {
      try {
        const preparedSession = await prepareAiVaultSessionForResume(session)
        await window.api.ui.writeClipboardText(buildResumeCommand(preparedSession, worktreeId))
        toast.success(
          translate(
            'auto.components.right.sidebar.AiVaultPanel.resumeCommandCopied',
            'Resume command copied'
          )
        )
      } catch (error) {
        notifyAiVaultSessionPreparationFailure(error)
      }
    },
    [buildResumeCommand]
  )

  const handleResume = useCallback(
    (session: AiVaultSession, targetWorktreeId?: string): void => {
      void resumeAiVaultSession({
        session,
        activeWorktreeId: activeWorktreeId ?? activeWorktree?.id ?? null,
        targetWorktreeId,
        targetState,
        agentCmdOverrides
      })
    },
    [activeWorktree?.id, activeWorktreeId, agentCmdOverrides, targetState]
  )

  const handleContinueInNewSession = useCallback(
    (session: AiVaultSession, targetWorktreeId: string): void => {
      const targetId = resolveAiVaultSessionLaunchTargetOrNotify({
        sessionFilePath: session.filePath,
        sessionExecutionHostId: session.executionHostId,
        activeWorktreeId: activeWorktreeId ?? activeWorktree?.id ?? null,
        targetWorktreeId,
        targetState
      })
      if (!targetId) {
        return
      }

      const targetWorkspacePath = resolveAiVaultTargetWorkspacePath(
        targetState,
        targetId.worktreeId
      )
      if (!targetWorkspacePath) {
        toast.error(
          translate(
            'auto.components.right.sidebar.AiVaultPanel.openWorkspaceBeforeResuming',
            'Open a workspace before resuming a session.'
          )
        )
        return
      }
      setContinuationRequest(
        prepareAiVaultSessionContinuation({
          session,
          targetWorktreeId: targetId.worktreeId,
          targetWorkspacePath
        })
      )
    },
    [activeWorktree?.id, activeWorktreeId, targetState]
  )

  const handleContinuationDialogOpenChange = useCallback((open: boolean): void => {
    if (!open) {
      setContinuationRequest(null)
    }
  }, [])

  return {
    buildResumeStartup,
    copyResumeCommand,
    handleResume,
    handleContinueInNewSession,
    continuationRequest,
    handleContinuationDialogOpenChange
  }
}

function notifyAiVaultSessionPreparationFailure(error: unknown): void {
  toast.error(
    error instanceof Error
      ? error.message
      : translate(
          'auto.components.right.sidebar.AiVaultPanel.prepareSessionResumeFailed',
          'Could not prepare this session for resume.'
        )
  )
}
