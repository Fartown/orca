import { AgentHookServerTmuxStatus } from '../agent-hooks/server/server-tmux-status'
import { normalizeHookPayload } from '../../shared/agent-hook-listener/normalization/normalize-hook-payload'
import type { AgentHookSource } from '../../shared/agent-hook-listener/transport/agent-hook-relay'
import { checkOwnerAfterRefusedClaudeHook } from '../../shared/claude-session-ownership/claude-session-activity'

/** Seats the Claude session-ownership guard around the hook server's pane-scoped local normalization. */
export abstract class AgentHookServerClaudeHookOwnership extends AgentHookServerTmuxStatus {
  protected normalizeOwnedLocalHook(
    paneKey: string,
    source: AgentHookSource,
    body: unknown,
    isReplay: boolean | undefined
  ): ReturnType<typeof normalizeHookPayload> {
    // An exited owner has nothing left to protect; its relaunch must not be refused as a background call.
    if (this.agentExitedAtByPaneKey.has(this.resolvePaneKeyAlias(paneKey))) {
      this.state.claudeSessionActivityByPaneKey.delete(paneKey)
    }
    const event = normalizeHookPayload(this.state, source, body, this.env, { isReplay })
    if (!event && !isReplay) {
      checkOwnerAfterRefusedClaudeHook(this.state, body, (key, sender, owner) =>
        this.checkAgentPresenceAfterHook(
          {
            ...owner,
            paneKey: key,
            agentPresence: {
              ...owner.agentPresence,
              agent: owner.agentPresence?.agent ?? 'claude',
              process: sender
            }
          },
          owner
        )
      )
    }
    return event
  }
}
