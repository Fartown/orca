// The continuation prompt builder lives in src/shared so the mobile client can reuse it;
// this module stays as the renderer's import path.
export {
  buildAgentSessionContinuationPrompt,
  hasFullAgentSessionContext
} from '../../../shared/agent-session-continuation/continuation-prompt'
export type {
  AgentSessionContinuationContextMode,
  AgentSessionContinuationRequest,
  AgentSessionContinuationSource
} from '../../../shared/agent-session-continuation/continuation-prompt'
