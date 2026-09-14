// The bounded-transcript builder lives in src/shared so the mobile client can reuse it;
// this module stays as the renderer's import path.
export {
  buildAgentSessionForkPrompt,
  buildBoundedSessionTranscript,
  cleanAgentSessionForkTranscript
} from '../../../shared/agent-session-continuation/bounded-session-transcript'
export type { AgentSessionForkPromptInput } from '../../../shared/agent-session-continuation/bounded-session-transcript'
