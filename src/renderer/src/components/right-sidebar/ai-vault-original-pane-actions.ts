import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import type { AgentStatusState } from '../../../../shared/agent-status-types'
import { translate } from '@/i18n/i18n'
import {
  findOriginalAiVaultSessionPane,
  type AiVaultOriginalPaneSessionReference
} from './ai-vault-original-pane'
import {
  createLazyAiVaultOriginalPaneIndex,
  findAiVaultSessionLiveStateInIndex,
  findOriginalAiVaultSessionPaneInIndex
} from './ai-vault-original-pane-index'

export function useAiVaultOriginalPaneActions(): {
  getOriginalPaneTarget: (
    session: AiVaultOriginalPaneSessionReference
  ) => ReturnType<typeof findOriginalAiVaultSessionPane>
  getSessionLiveState: (session: AiVaultOriginalPaneSessionReference) => AgentStatusState | null
  jumpToOriginalPane: (session: AiVaultOriginalPaneSessionReference) => void
  jumpToWorktree: (worktreeId: string) => void
} {
  const originalPaneLookupState = useAppStore(
    useShallow((s) => ({
      agentStatusByPaneKey: s.agentStatusByPaneKey,
      retainedAgentsByPaneKey: s.retainedAgentsByPaneKey,
      sleepingAgentSessionsByPaneKey: s.sleepingAgentSessionsByPaneKey,
      tabsByWorktree: s.tabsByWorktree,
      terminalLayoutsByTabId: s.terminalLayoutsByTabId
    }))
  )
  // Why: loading, filtered, or collapsed views may render no session rows.
  // Build once on the first actual lookup, then share it across visible rows.
  const getOriginalPaneIndex = useMemo(
    () => createLazyAiVaultOriginalPaneIndex(originalPaneLookupState),
    [originalPaneLookupState]
  )

  const getOriginalPaneTarget = useCallback(
    (session: AiVaultOriginalPaneSessionReference) =>
      findOriginalAiVaultSessionPaneInIndex(getOriginalPaneIndex(), session),
    [getOriginalPaneIndex]
  )

  const getSessionLiveState = useCallback(
    (session: AiVaultOriginalPaneSessionReference) =>
      findAiVaultSessionLiveStateInIndex(getOriginalPaneIndex(), session),
    [getOriginalPaneIndex]
  )

  const jumpToOriginalPane = useCallback((session: AiVaultOriginalPaneSessionReference): void => {
    jumpToAiVaultOriginalPane(session)
  }, [])

  const jumpToWorktree = useCallback((worktreeId: string): void => {
    if (!activateAndRevealWorkspace(worktreeId)) {
      toast.error(
        translate(
          'auto.components.right.sidebar.AiVaultPanel.worktreeUnavailable',
          'Worktree is no longer available.'
        )
      )
    }
  }, [])

  return { getOriginalPaneTarget, getSessionLiveState, jumpToOriginalPane, jumpToWorktree }
}

export type AiVaultOriginalPaneJumpResult = 'focused' | 'missing' | 'workspace-unavailable'

export function jumpToAiVaultOriginalPane(
  session: AiVaultOriginalPaneSessionReference,
  options: { notifyWhenMissing?: boolean } = {}
): AiVaultOriginalPaneJumpResult {
  const target = findOriginalAiVaultSessionPane(useAppStore.getState(), session)
  if (!target) {
    if (options.notifyWhenMissing !== false) {
      toast.error(
        translate(
          'auto.components.right.sidebar.AiVaultPanel.originalPaneUnavailable',
          'Original pane is no longer available.'
        )
      )
    }
    return 'missing'
  }

  if (
    !activateAndRevealWorkspace(
      target.worktreeId,
      session.executionHostId ? { executionHostId: session.executionHostId } : undefined
    )
  ) {
    toast.error(
      translate(
        'auto.components.right.sidebar.AiVaultPanel.worktreeUnavailable',
        'Worktree is no longer available.'
      )
    )
    return 'workspace-unavailable'
  }
  useAppStore.getState().setActiveTabType('terminal')
  activateTabAndFocusPane(target.tabId, target.leafId, {
    flashFocusedPane: true,
    scrollToBottomIfOutputSinceLastView: true
  })
  return 'focused'
}
