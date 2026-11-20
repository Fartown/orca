import type { z } from 'zod'
import { InvalidArgumentError } from '../runtime/rpc/core'
import type { DurableChatComposer } from '../../shared/native-chat-view-recovery/durable-chat-submit'

type ChatComposer = z.infer<typeof DurableChatComposer> | undefined

/** terminal.send's durable chat branch, kept here so the upstream method stays within its line budget. */
export const durableChatSend = {
  /** Durable chat input is only confirmable through a request receipt on a running prompt agent. */
  assert(chatComposer: ChatComposer, hasRequestReceipt: boolean, usesAgentPrompt: boolean): void {
    if (chatComposer && (!hasRequestReceipt || !usesAgentPrompt)) {
      throw new InvalidArgumentError(
        'Durable chat requires a supported running agent and request ID'
      )
    }
  },
  /** Binds a durable chat send to the exact composer target it was prepared against. */
  promptOptions(chatComposer: ChatComposer) {
    return chatComposer
      ? {
          chatComposer,
          composerReady: true,
          expectedBinding: {
            ptyId: chatComposer.expectedPtyId,
            processIncarnation: chatComposer.expectedIncarnation
          }
        }
      : {}
  }
}
