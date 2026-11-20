import { reconcileDurableChatSubmissions } from '../../shared/native-chat-view-recovery/durable-chat-reconciliation'
import type { RuntimeRpcResponse } from '../../shared/remote-runtime/rpc/runtime-rpc-envelope'
import {
  DurableChatPrepare,
  DurableChatTranscriptBoundary,
  type DurableChatUserEvidence,
  type DurableChatPrepareArgs,
  type DurableChatSubmitRecord
} from '../../shared/native-chat-view-recovery/durable-chat-submit'
import type { DurableChatOutbox } from './durable-chat-outbox'

type PreparedTarget = Pick<
  DurableChatSubmitRecord,
  | 'terminal'
  | 'hostPtyId'
  | 'processIncarnation'
  | 'environmentId'
  | 'pairingRevision'
  | 'runtimeId'
  | 'executionHostId'
  | 'installationId'
>

export class DurableChatSubmitter {
  private readonly active = new Map<string, Promise<void>>()

  constructor(
    private readonly outbox: DurableChatOutbox,
    private readonly deps: {
      prepare: (args: DurableChatPrepareArgs) => Promise<PreparedTarget>
      call: (
        record: DurableChatSubmitRecord,
        method: string,
        params: unknown,
        requestId?: string
      ) => Promise<RuntimeRpcResponse<unknown>>
      changed: () => void
    }
  ) {}

  async prepare(input: DurableChatPrepareArgs): Promise<DurableChatSubmitRecord> {
    const args = DurableChatPrepare.parse(input)
    if (!args.text.trim() && args.imagePaths.length === 0) {
      throw new Error('Empty chat submission')
    }
    const target = await this.deps.prepare(args)
    const record: DurableChatSubmitRecord = {
      ...args,
      ...target,
      state: 'prepared',
      updatedAt: Date.now()
    }
    await this.outbox.update((records) => {
      if (records.some((entry) => entry.id === record.id)) {
        throw new Error('Chat submission already exists')
      }
      if (records.filter((entry) => entry.state !== 'confirmed').length >= 500) {
        throw new Error('Confirm existing chat submissions before sending more')
      }
      return [...records, record]
    })
    this.deps.changed()
    return record
  }

  async list(paneKey: string): Promise<DurableChatSubmitRecord[]> {
    return (await this.outbox.list()).filter((record) => record.paneKey === paneKey)
  }

  async dispatch(id: string): Promise<void> {
    if (this.active.has(id)) {
      return
    }
    const completion = Promise.withResolvers<void>()
    this.active.set(id, completion.promise)
    try {
      let record: DurableChatSubmitRecord | undefined
      await this.outbox.update((records) =>
        records.map((entry) => {
          if (entry.id !== id || entry.state !== 'prepared') {
            return entry
          }
          record = { ...entry, state: 'dispatching', updatedAt: Date.now() }
          return record
        })
      )
      if (!record) {
        return
      }
      this.deps.changed()
      const response = await this.deps.call(
        record,
        'terminal.send',
        {
          terminal: record.terminal,
          text: record.text || ' ',
          enter: true,
          agentPrompt: true,
          client: { id: 'orca-desktop-chat', type: 'desktop' },
          chatComposer: {
            reconcileRestoredSession: record.reconcileRestoredSession,
            expectedSessionId: record.sessionId,
            clearInput: record.clearInput,
            imagePaths: record.imagePaths,
            expectedPtyId: record.hostPtyId,
            expectedIncarnation: record.processIncarnation
          }
        },
        id
      )
      await this.applyReceipt(id, response)
    } catch {
      await this.setState(id, 'unconfirmed')
    } finally {
      this.active.delete(id)
      completion.resolve()
    }
  }

  async query(id: string): Promise<void> {
    await this.active.get(id)
    const record = (await this.outbox.list()).find((entry) => entry.id === id)
    if (!record || record.state === 'prepared' || record.state === 'confirmed') {
      return
    }
    try {
      const response = await this.deps.call(record, 'orchestration.requestShow', { request: id })
      const value = response.ok ? response.result : null
      await (response.ok &&
      value &&
      typeof value === 'object' &&
      'receipt' in value &&
      value.receipt
        ? this.applyReceipt(id, { ...response, ok: true, result: value.receipt })
        : this.setState(id, 'unconfirmed'))
    } catch {
      await this.setState(id, 'unconfirmed')
    }
  }

  async confirm(
    paneKey: string,
    sessionId: string,
    evidence: readonly DurableChatUserEvidence[]
  ): Promise<void> {
    const verified = new Set<string>()
    for (const record of await this.outbox.list()) {
      if (
        record.paneKey !== paneKey ||
        record.sessionId !== sessionId ||
        !record.transcriptBoundary ||
        ['prepared', 'rejected', 'confirmed'].includes(record.state)
      ) {
        continue
      }
      try {
        const response = await this.deps.call(record, 'orchestration.requestShow', {
          request: record.id,
          verifyChatTranscript: true
        })
        if (
          response.ok &&
          response.result &&
          typeof response.result === 'object' &&
          'chatTranscriptVerified' in response.result &&
          response.result.chatTranscriptVerified === true
        ) {
          verified.add(record.id)
        }
      } catch {}
    }
    let changed = false
    await this.outbox.update((records) => {
      const matches = reconcileDurableChatSubmissions(
        records
          .filter((entry) => entry.paneKey === paneKey)
          .map((entry) =>
            verified.has(entry.id) ? entry : { ...entry, transcriptBoundary: undefined }
          ),
        evidence,
        sessionId
      )
      if (matches.size === 0) {
        return records
      }
      changed = true
      const next = records.map((entry) => {
        const message = matches.get(entry.id)
        return message
          ? {
              ...entry,
              state: 'confirmed' as const,
              confirmedMessageId: message.id,
              confirmedMessageOrder: message.transcriptOrder,
              text: '',
              imagePaths: [],
              updatedAt: Date.now()
            }
          : entry
      })
      const open = next.filter(
        (entry) => !['prepared', 'rejected', 'confirmed'].includes(entry.state)
      )
      return next.filter(
        (entry) =>
          entry.state !== 'confirmed' ||
          open.some(
            (other) =>
              other.sessionId === entry.sessionId &&
              other.executionHostId === entry.executionHostId &&
              (other.transcriptBoundary === undefined ||
                entry.confirmedMessageOrder === undefined ||
                other.transcriptBoundary.afterByteOffset <= entry.confirmedMessageOrder)
          )
      )
    })
    if (changed) {
      this.deps.changed()
    }
  }

  private async applyReceipt(id: string, response: RuntimeRpcResponse<unknown>): Promise<void> {
    const value = response.ok ? response.result : null
    const send = value && typeof value === 'object' && 'send' in value ? value.send : null
    const accepted = send && typeof send === 'object' && 'accepted' in send ? send.accepted : null
    const proof =
      send &&
      typeof send === 'object' &&
      'prompt' in send &&
      send.prompt &&
      typeof send.prompt === 'object' &&
      'chatTranscript' in send.prompt
        ? DurableChatTranscriptBoundary.safeParse(send.prompt.chatTranscript)
        : null
    await this.setState(
      id,
      accepted === true ? 'input_accepted' : accepted === false ? 'rejected' : 'unconfirmed',
      proof?.success ? proof.data : undefined
    )
  }

  private async setState(
    id: string,
    state: DurableChatSubmitRecord['state'],
    transcriptBoundary?: DurableChatSubmitRecord['transcriptBoundary']
  ): Promise<void> {
    await this.outbox.update((records) =>
      records.map((entry) =>
        entry.id === id && entry.state !== 'confirmed'
          ? {
              ...entry,
              state,
              ...(transcriptBoundary ? { transcriptBoundary } : {}),
              updatedAt: Date.now()
            }
          : entry
      )
    )
    this.deps.changed()
  }
}
