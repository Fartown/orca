import { OrcaRuntimeWithResubmitHeldAgentPrompt } from '../runtime/terminal/input/terminal-agent-prompt-resubmit'
import type {
  AgentPromptExpectedBinding,
  RuntimeAgentPromptWriteOptions
} from '../runtime/terminal/input/agent-prompt-write-options'
import type { AgentPromptActivity } from '../runtime/terminal/input/agent-prompt-submission-verification'
import { assertTerminalInputAdmitted } from '../runtime/terminal/input/terminal-input-admission'
import { waitForAgentPromptDelay } from '../runtime/terminal/input/agent-prompt-signals'
import {
  captureDurableChatTranscriptBoundary,
  durableChatProviderSession,
  durableChatSubmissionSession
} from './durable-chat-transcript-boundary'
import { restoredTerminalAuthorityMatches } from './restored-terminal-authority'
import { writeDurableChatComposerPrefix } from './durable-chat-composer-input'

export abstract class OrcaRuntimeWithDurableChatPrompt extends OrcaRuntimeWithResubmitHeldAgentPrompt {
  protected assertAgentPromptExpectedBinding(
    handle: string,
    expected: AgentPromptExpectedBinding | undefined
  ): void {
    if (!expected) {
      return
    }
    const current = this.getTerminalPromptRequestBinding(handle)
    if (
      current.ptyId !== expected.ptyId ||
      current.processIncarnation !== expected.processIncarnation
    ) {
      throw new Error('terminal_handle_stale')
    }
  }

  protected assertDurableChatSession(
    handle: string,
    options: RuntimeAgentPromptWriteOptions
  ): void {
    if (options.chatComposer) {
      durableChatSubmissionSession(
        this,
        handle,
        options.chatComposer.expectedSessionId,
        this.canSubmitRestoredChat(handle, options.chatComposer)
      )
    }
  }
  private canSubmitRestoredChat(
    handle: string,
    composer: NonNullable<RuntimeAgentPromptWriteOptions['chatComposer']>
  ): boolean {
    const terminal = this.getOrchestrationDispatchAuthority(handle)
    return !!(
      composer.reconcileRestoredSession &&
      terminal &&
      restoredTerminalAuthorityMatches(
        this.restoredOrchestrationAuthorityByPtyId.get(terminal.ptyId),
        terminal,
        (left, right) => this.orchestrationCompatibilityHostScopesEqual(left, right)
      )
    )
  }
  verifyRestoredChatProviderSession(
    handle: string,
    ptyId: string,
    processIncarnation: string,
    sessionId: string,
    submittedAt: number
  ): boolean {
    try {
      const binding = this.getTerminalPromptRequestBinding(handle)
      if (binding.ptyId !== ptyId || binding.processIncarnation !== processIncarnation) {
        return false
      }
      durableChatProviderSession(this, handle, sessionId)
      const exact = this.getExactWorkerProviderSession(handle, 0)
      const row = this.getAgentProviderSessionRows().find(
        (entry) => entry.paneKey === exact?.paneKey && entry.receivedAt === exact.observedAt
      )
      return !!(
        row?.observation?.origin === 'hook' &&
        row.observation.kind === 'transition' &&
        row.observation.observedAt >= submittedAt &&
        row.turnStartedAt !== undefined &&
        row.turnStartedAt >= submittedAt
      )
    } catch {
      return false
    }
  }
  protected captureDurableChatBoundary(
    handle: string,
    composer: NonNullable<RuntimeAgentPromptWriteOptions['chatComposer']>
  ) {
    return captureDurableChatTranscriptBoundary(
      this,
      handle,
      composer.expectedSessionId,
      this.canSubmitRestoredChat(handle, composer)
    )
  }
  protected async writeAgentPromptChunk(
    ptyId: string,
    data: string,
    options: RuntimeAgentPromptWriteOptions
  ): Promise<boolean> {
    if (!options.chatComposer) {
      return this.ptyController?.write(ptyId, data, options.inputKind) ?? false
    }
    const result = await this.ptyController?.writeWithSettlement?.(ptyId, data, options.inputKind)
    if (result?.outcome !== 'accepted') {
      throw new Error('terminal_write_unconfirmed')
    }
    return true
  }
  protected async prepareDurableChatComposer(
    handle: string,
    ptyId: string,
    options: RuntimeAgentPromptWriteOptions,
    beforeWrite: (signal: AbortSignal) => Promise<void>,
    deliverySignal: AbortSignal,
    permissionBaseline: AgentPromptActivity
  ): Promise<void> {
    if (!options.chatComposer) {
      return
    }
    if (this.getPtyAgent(ptyId) !== 'codex') {
      throw new Error('terminal_handle_stale')
    }
    await writeDurableChatComposerPrefix({
      composer: options.chatComposer,
      text: options.promptForSchedule ?? '',
      write: async (data) => {
        await beforeWrite(deliverySignal)
        this.assertAgentPromptPermissionSafe(
          permissionBaseline,
          this.getAgentPromptActivity(handle, ptyId)
        )
        assertTerminalInputAdmitted(this, ptyId, options.inputSource)
        if (!(await this.writeAgentPromptChunk(ptyId, data, options))) {
          throw new Error('terminal_not_writable')
        }
      },
      confirmEmpty: async () => {
        const screen = await this.readCurrentTerminalWaitScreen(ptyId)
        await beforeWrite(deliverySignal)
        return !!screen && !screen.draft?.trim()
      },
      delay: (ms) => waitForAgentPromptDelay(ms, deliverySignal)
    })
    await beforeWrite(deliverySignal)
  }
}
