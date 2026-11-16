import { OrcaRuntimeWithResubmitHeldAgentPrompt } from '../runtime/terminal/input/terminal-agent-prompt-resubmit'
import type {
  AgentPromptExpectedBinding,
  RuntimeAgentPromptWriteOptions
} from '../runtime/runtime-terminal-contracts'
import type { AgentPromptActivity } from '../runtime/agent-prompt-submission-verification'
import { assertTerminalInputAdmitted } from '../runtime/terminal-input-admission'
import { waitForAgentPromptDelay } from '../runtime/orca-runtime-core'
import {
  captureDurableChatTranscriptBoundary,
  durableChatProviderSession
} from './durable-chat-transcript-boundary'
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
      durableChatProviderSession(this, handle, options.chatComposer.expectedSessionId)
    }
  }
  protected captureDurableChatBoundary(
    handle: string,
    composer: NonNullable<RuntimeAgentPromptWriteOptions['chatComposer']>
  ) {
    return captureDurableChatTranscriptBoundary(this, handle, composer.expectedSessionId)
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
