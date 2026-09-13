import { useCallback, useRef, useState } from 'react'
import {
  buildAgentSessionContinuationPrompt,
  hasFullAgentSessionContext,
  type AgentSessionContinuationContextMode
} from '../../../src/shared/agent-session-continuation/continuation-prompt'
import type { ActionSheetAction } from '../components/ActionSheetModal'
import { triggerError, triggerSuccess } from '../platform/haptics'
import { loadMobileNewTabAgentOptions } from '../session/mobile-new-tab-agent-loader'
import type { RpcClient } from '../transport/rpc-client'
import {
  isMobileSessionContinuationAgent,
  type MobileSessionContinuationAgent
} from './continuation-agents'
import { CONTINUATION_COPY } from './continuation-copy'
import {
  runMobileSessionContinuation,
  type MobileContinuationTerminal,
  type MobileSessionContinuationOutcome
} from './continuation-delivery'
import { resolveMobileContinuationSource, type MobileContinuationTab } from './continuation-source'
import {
  buildMobileContinuationSheetActions,
  type MobileContinuationAgentsState
} from './continuation-sheet-actions'

export type MobileContinuationTarget = MobileContinuationTab & {
  id: string
  terminal: string | null
}

const TOAST_MS = 2200

export function continuationOutcomeToast(
  outcome: MobileSessionContinuationOutcome,
  agent: MobileSessionContinuationAgent
): { message: string; ok: boolean } {
  switch (outcome.kind) {
    case 'delivered':
      return { message: CONTINUATION_COPY.sent(agent), ok: true }
    case 'no-context':
      return { message: CONTINUATION_COPY.noContext, ok: false }
    case 'create-failed':
      return { message: CONTINUATION_COPY.launchFailed(agent), ok: false }
    case 'unknown':
      return { message: CONTINUATION_COPY.deliveryUnknown, ok: false }
    default:
      // not-ready and send-rejected both leave a live session without its context.
      return { message: CONTINUATION_COPY.deliveryFailed(agent), ok: false }
  }
}

/**
 * Drives the continuation picker: loads the agents this workspace host offers, keeps the
 * context-mode choice, and runs the delivery once an agent row is pressed. The sheet closes on
 * press so the newly activated terminal is visible while the handoff lands.
 */
export function useMobileSessionContinuation(args: {
  client: RpcClient | null
  worktreeId: string
  deviceToken: string | null
  hostSupported: boolean | null
  createTerminal: (
    agent: MobileSessionContinuationAgent,
    cwd: string | null
  ) => Promise<MobileContinuationTerminal | null>
  showToast: (message: string, durationMs?: number) => void
}) {
  const [target, setTarget] = useState<MobileContinuationTarget | null>(null)
  const [agents, setAgents] = useState<MobileContinuationAgentsState>({ status: 'loading' })
  const [contextMode, setContextMode] = useState<AgentSessionContinuationContextMode>('focused')
  // Why: a detect that resolves after the user reopened the sheet on another tab must not
  // overwrite the newer load.
  const loadSeqRef = useRef(0)
  const inFlightRef = useRef(false)

  const close = useCallback(() => setTarget(null), [])

  const open = useCallback(
    (tab: MobileContinuationTarget) => {
      const seq = ++loadSeqRef.current
      setTarget(tab)
      setContextMode('focused')
      setAgents({ status: 'loading' })
      const client = args.client
      if (!client) {
        setAgents({ status: 'failed' })
        return
      }
      void loadMobileNewTabAgentOptions({ client, worktreeId: args.worktreeId })
        .then((options) => {
          if (seq !== loadSeqRef.current) {
            return
          }
          setAgents({
            status: 'ready',
            agents: options
              .map((option) => option.agent)
              .filter((agent): agent is MobileSessionContinuationAgent =>
                isMobileSessionContinuationAgent(agent)
              )
          })
        })
        .catch(() => {
          if (seq === loadSeqRef.current) {
            setAgents({ status: 'failed' })
          }
        })
    },
    [args.client, args.worktreeId]
  )

  const start = useCallback(
    (agent: MobileSessionContinuationAgent) => {
      const client = args.client
      if (!client || !target || inFlightRef.current) {
        return
      }
      const eligibility = resolveMobileContinuationSource(target, args.hostSupported)
      const prompt = eligibility.eligible
        ? buildAgentSessionContinuationPrompt(eligibility.source, contextMode)
        : null
      setTarget(null)
      if (!eligibility.eligible || !prompt) {
        triggerError()
        args.showToast(CONTINUATION_COPY.noContext, TOAST_MS)
        return
      }
      inFlightRef.current = true
      void runMobileSessionContinuation({
        sendRequest: client.sendRequest,
        createTerminal: args.createTerminal,
        agent,
        prompt,
        cwd: eligibility.source.sourceWorkingDirectory ?? null,
        deviceToken: args.deviceToken
      })
        .then((outcome) => {
          const toast = continuationOutcomeToast(outcome, agent)
          if (toast.ok) {
            triggerSuccess()
          } else {
            triggerError()
          }
          args.showToast(toast.message, TOAST_MS)
        })
        .catch(() => {
          triggerError()
          args.showToast(CONTINUATION_COPY.deliveryFailed(agent), TOAST_MS)
        })
        .finally(() => {
          inFlightRef.current = false
        })
    },
    [args, contextMode, target]
  )

  const eligibility = target ? resolveMobileContinuationSource(target, args.hostSupported) : null
  const actions: ActionSheetAction[] = target
    ? buildMobileContinuationSheetActions({
        agents,
        contextMode,
        fullContextAvailable: eligibility?.eligible
          ? hasFullAgentSessionContext(eligibility.source)
          : false,
        onToggleMode: () => setContextMode((mode) => (mode === 'focused' ? 'full' : 'focused')),
        onStart: start
      })
    : []

  return {
    continuationTarget: target,
    continuationActions: actions,
    continuationTitle: target?.title?.trim() || CONTINUATION_COPY.sheetTitleFallback,
    continuationMessage: eligibility?.eligible
      ? CONTINUATION_COPY.originalAgent(eligibility.sourceAgent)
      : undefined,
    openContinuation: open,
    closeContinuation: close
  }
}
