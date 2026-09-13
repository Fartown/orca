import { useCallback, useRef, useState } from 'react'
import {
  buildAgentSessionContinuationPrompt,
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
  type MobileContinuationCreateResult,
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
    case 'created-without-handle':
      // The session exists and is selected; only the handoff could not be written.
      return { message: CONTINUATION_COPY.deliveryFailed(agent), ok: false }
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
  createTerminal: (
    agent: MobileSessionContinuationAgent,
    cwd: string | null,
    clientMutationId: string
  ) => Promise<MobileContinuationCreateResult>
  showToast: (message: string, durationMs?: number) => void
}) {
  const [target, setTarget] = useState<MobileContinuationTarget | null>(null)
  const [agents, setAgents] = useState<MobileContinuationAgentsState>({ status: 'loading' })
  const [contextMode, setContextMode] = useState<AgentSessionContinuationContextMode>('focused')
  // Why: a detect that resolves after the user reopened the sheet on another tab must not
  // overwrite the newer load.
  const loadSeqRef = useRef(0)
  const inFlightRef = useRef(false)
  // Why: a retry after an ambiguous create must reuse its idempotency key so the host resolves
  // it to the in-flight terminal; a fresh start after success mints a new one. Keyed by source
  // tab, mirroring the AI Vault resume registry.
  const mutationIdsRef = useRef(new Map<string, string>())

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
      if (!target) {
        return
      }
      if (!client || inFlightRef.current) {
        // Why not silent: the sheet closes on press, so a swallowed tap looks like the feature
        // did nothing and the user retries into the same guard.
        setTarget(null)
        triggerError()
        args.showToast(
          inFlightRef.current ? CONTINUATION_COPY.busy : CONTINUATION_COPY.launchFailed(agent),
          TOAST_MS
        )
        return
      }
      const eligibility = resolveMobileContinuationSource(target)
      const prompt = eligibility.eligible
        ? buildAgentSessionContinuationPrompt(eligibility.source, contextMode)
        : null
      const sourceTabId = target.id
      setTarget(null)
      if (!eligibility.eligible || !prompt) {
        triggerError()
        args.showToast(CONTINUATION_COPY.noContext, TOAST_MS)
        return
      }
      inFlightRef.current = true
      const mutationIds = mutationIdsRef.current
      let mutationId = mutationIds.get(sourceTabId)
      if (!mutationId) {
        mutationId = `mobile-continuation:${sourceTabId.slice(0, 24)}:${Date.now().toString(36)}`
        mutationIds.set(sourceTabId, mutationId)
      }
      void runMobileSessionContinuation({
        client,
        createTerminal: (createAgent, cwd) =>
          args.createTerminal(createAgent, cwd, mutationId as string),
        agent,
        prompt,
        cwd: eligibility.source.sourceWorkingDirectory ?? null,
        deviceToken: args.deviceToken
      })
        .then((outcome) => {
          if (outcome.kind === 'delivered') {
            // Only a settled handoff releases the key; every other end state may be retried.
            mutationIds.delete(sourceTabId)
          }
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

  const eligibility = target ? resolveMobileContinuationSource(target) : null
  const actions: ActionSheetAction[] = target
    ? buildMobileContinuationSheetActions({
        agents,
        contextMode,
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
