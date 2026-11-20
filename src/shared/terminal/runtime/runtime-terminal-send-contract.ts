import type { z } from 'zod'
import type { DurableChatTranscriptBoundary } from '../../native-chat-view-recovery/durable-chat-submit'
import type { WriteSettlement } from '../pty/lifecycle/pty-write-settlement'

export type RuntimeTerminalSend = {
  handle: string
  accepted: boolean
  bytesWritten: number
  refusedReason?: 'no-agent' | 'permission' | 'approval-unseen'
  prompt?: RuntimeTerminalPromptDelivery
  writeSettlement?: WriteSettlement
}

export type RuntimeTerminalPromptStage = 'input_accepted' | 'turn_started'

export type RuntimeTerminalPromptDelivery = {
  chatTranscript?: z.infer<typeof DurableChatTranscriptBoundary>
  requestId: string
  stages: RuntimeTerminalPromptStage[]
  provider: 'antigravity' | 'claude' | 'codex' | 'unsupported' | 'old-host'
  observation: 'supported' | 'unsupported' | 'incarnation_replaced' | 'permission'
  processIncarnation: string
  generation: number
  baselineWorkingSequence: number
  /** Hook turn-start timestamp before this prompt was accepted. */
  baselineExplicitWorkingStartedAt?: number | null
  /** Permission observations seen before this prompt was accepted. */
  baselinePermissionSequence?: number
}
