// Upstream #46124 moved the prompt builder into src/shared; this module stays as the fork's
// mobile continuation import path so both clients share that one implementation.
export {
  buildAgentSessionContinuationPrompt,
  hasFullAgentSessionContext,
  resolveAgentSessionContinuationTranscriptPath
} from '../agent-session/conversation-context/agent-session-continuation'
export type {
  AgentSessionContinuationContextMode,
  AgentSessionContinuationRequest,
  AgentSessionContinuationSource
} from '../agent-session/conversation-context/agent-session-continuation'
