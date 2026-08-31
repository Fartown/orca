import type {
  ConversationRuntimeDeleteProbe,
  ConversationRuntimeDeleteState
} from './conversation-forget-service'

export type RuntimeAttachment = {
  conversationId: string
  paneKey: string
  tabId: string | null
  worktreeId: string | null
  connectionId: string | null
  providerIdentityFingerprint: string | null
  executionState: ConversationRuntimeDeleteState['executionState']
  observedAt: number
}

export class ConversationRuntimeAttachmentRegistry implements ConversationRuntimeDeleteProbe {
  private readonly byRuntimeKey = new Map<string, RuntimeAttachment>()
  private generation = 0

  get revision(): number {
    return this.generation
  }

  upsert(attachment: RuntimeAttachment): void {
    const key = runtimeKey(attachment.paneKey, attachment.connectionId)
    const previous = this.byRuntimeKey.get(key)
    if (previous && attachment.observedAt < previous.observedAt) {
      return
    }
    if (!previous || !sameAttachment(previous, attachment)) {
      this.byRuntimeKey.set(key, attachment)
      this.generation += 1
    }
  }

  clearPane(input: { paneKey: string; connectionId?: string | null; transient?: boolean }): void {
    let changed = false
    for (const [key, attachment] of this.byRuntimeKey) {
      if (attachment.paneKey !== input.paneKey) {
        continue
      }
      if (input.transient && attachment.connectionId !== (input.connectionId ?? null)) {
        continue
      }
      this.byRuntimeKey.delete(key)
      changed = true
    }
    if (changed) {
      this.generation += 1
    }
  }

  clearConnection(connectionId: string): void {
    let changed = false
    for (const [key, attachment] of this.byRuntimeKey) {
      if (attachment.connectionId !== connectionId) {
        continue
      }
      this.byRuntimeKey.delete(key)
      changed = true
    }
    if (changed) {
      this.generation += 1
    }
  }

  retainEvidencePanes(paneKeys: ReadonlySet<string>): void {
    let changed = false
    for (const [key, attachment] of this.byRuntimeKey) {
      if (paneKeys.has(attachment.paneKey)) {
        continue
      }
      this.byRuntimeKey.delete(key)
      changed = true
    }
    if (changed) {
      this.generation += 1
    }
  }

  listForConversation(conversationId: string): RuntimeAttachment[] {
    return [...this.byRuntimeKey.values()]
      .filter((attachment) => attachment.conversationId === conversationId)
      .sort((left, right) => right.observedAt - left.observedAt)
  }

  getDeleteState(conversationId: string): ConversationRuntimeDeleteState {
    const attachments = this.listForConversation(conversationId)
    const executionState = attachments.some((item) => item.executionState === 'waiting')
      ? 'waiting'
      : attachments.some((item) => item.executionState === 'running')
        ? 'running'
        : attachments.some((item) => item.executionState === 'launching')
          ? 'launching'
          : attachments.some((item) => item.executionState === 'failed')
            ? 'failed'
            : 'stopped'
    return {
      attachmentGeneration: this.generation,
      attached: attachments.length > 0,
      executionState
    }
  }
}

function runtimeKey(paneKey: string, connectionId: string | null): string {
  return `${connectionId ?? 'local'}\0${paneKey}`
}

function sameAttachment(left: RuntimeAttachment, right: RuntimeAttachment): boolean {
  return (
    left.conversationId === right.conversationId &&
    left.paneKey === right.paneKey &&
    left.tabId === right.tabId &&
    left.worktreeId === right.worktreeId &&
    left.connectionId === right.connectionId &&
    left.providerIdentityFingerprint === right.providerIdentityFingerprint &&
    left.executionState === right.executionState &&
    left.observedAt === right.observedAt
  )
}
