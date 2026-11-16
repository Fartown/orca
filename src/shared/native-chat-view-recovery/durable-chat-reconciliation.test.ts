import { describe, expect, it } from 'vitest'
import {
  reconcileDurableChatSubmissions as reconcileEvidence,
  durableChatUserEvidence
} from './durable-chat-reconciliation'
import type { DurableChatSubmitRecord } from './durable-chat-submit'
import type { NativeChatMessage } from '../native-chat/native-chat-types'

function reconcileDurableChatSubmissions(
  records: readonly DurableChatSubmitRecord[],
  messages: readonly NativeChatMessage[],
  sessionId: string | null
) {
  return reconcileEvidence(records, durableChatUserEvidence(messages), sessionId)
}

function record(
  id: string,
  override: Partial<DurableChatSubmitRecord> = {}
): DurableChatSubmitRecord {
  return {
    id,
    paneKey: 'pane',
    ptyId: 'pty',
    sessionId: 'session',
    text: 'same text',
    imagePaths: [],
    clearInput: '\x15',
    sentAt: 100,
    afterMessageId: 'client-old',
    afterMessageTimestamp: 0,
    terminal: 'term',
    hostPtyId: 'pty',
    processIncarnation: 'inc',
    environmentId: 'mini',
    runtimeId: 'runtime',
    executionHostId: 'runtime:mini',
    state: 'input_accepted',
    updatedAt: 100,
    transcriptBoundary: {
      sessionId: 'session',
      afterMessageId: 'host-boundary',
      afterByteOffset: 500,
      transcriptPath: '/fixture/transcript.jsonl',
      fileIdentity: 'dev:ino',
      boundaryFingerprint: 'boundary',
      empty: false,
      submittedAt: 500
    },
    ...override
  }
}
function user(
  id: string,
  timestamp: number | null = 600,
  imagePaths: string[] = [],
  transcriptOrder = timestamp ?? 600
): NativeChatMessage {
  return {
    id,
    role: 'user',
    source: 'hook',
    timestamp,
    transcriptOrder,
    blocks: [
      { type: 'text', text: 'same text' },
      ...imagePaths.map((path) => ({ type: 'image-ref' as const, path }))
    ]
  }
}
const boundary = user('host-boundary', 400)

describe('Codex durable transcript receipts', () => {
  it('requires host receipt, original session, host boundary and a newer body row', () => {
    expect([
      ...reconcileDurableChatSubmissions(
        [record('send')],
        [boundary, user('actual')],
        'session'
      ).keys()
    ]).toEqual(['send'])
    for (const records of [
      [record('send', { transcriptBoundary: undefined })],
      [record('send', { sessionId: 'other' })]
    ]) {
      expect(
        reconcileDurableChatSubmissions(records, [boundary, user('actual')], 'session').size
      ).toBe(0)
    }
    for (const rows of [
      [user('old', 450)],
      [{ ...user('no-file-position'), transcriptOrder: undefined }]
    ]) {
      expect(reconcileDurableChatSubmissions([record('send')], rows, 'session').size).toBe(0)
    }
    expect(
      reconcileDurableChatSubmissions([record('send')], [user('actual')], 'session').has('send')
    ).toBe(true)
  })

  it('uses authoritative file position across missing timestamps and clock rollback', () => {
    for (const timestamp of [null, 450]) {
      expect(
        reconcileDurableChatSubmissions(
          [record('send')],
          [boundary, user('actual', timestamp, [], 600)],
          'session'
        ).get('send')?.id
      ).toBe('actual')
    }
  })

  it('never lets a loading empty client snapshot or paged-out boundary consume old identical text', () => {
    const pending = record('send', {
      afterMessageId: null,
      afterEmptyTranscriptSessionId: 'session'
    })
    expect(reconcileDurableChatSubmissions([pending], [user('old', 100)], 'session').size).toBe(0)
    expect(reconcileDurableChatSubmissions([pending], [], 'session').size).toBe(0)
  })

  it('does not let refused/prepared sends steal the resend row or its images', () => {
    const failed = record('failed', { state: 'rejected', imagePaths: ['/a.png'] })
    const unsent = record('unsent', { state: 'prepared' })
    const resent = record('resent', { imagePaths: ['/b.png'] })
    expect([
      ...reconcileDurableChatSubmissions(
        [failed, unsent, resent],
        [boundary, user('actual', 600, ['/b.png'])],
        'session'
      ).keys()
    ]).toEqual(['resent'])
    expect(
      reconcileDurableChatSubmissions([resent], [boundary, user('text-only')], 'session').size
    ).toBe(0)
  })

  it('claims each real row once across duplicate queued sends and subsequent renderer reads', () => {
    const first = record('first')
    const second = record('second', {
      sentAt: 200,
      transcriptBoundary: {
        sessionId: 'session',
        afterMessageId: 'host-boundary',
        afterByteOffset: 500,
        transcriptPath: '/fixture/transcript.jsonl',
        fileIdentity: 'dev:ino',
        boundaryFingerprint: 'boundary',
        empty: false,
        submittedAt: 550
      }
    })
    const rows = [boundary, user('row-1', 600)]
    expect(
      [...reconcileDurableChatSubmissions([first, second], rows, 'session').entries()].map(
        ([id, m]) => [id, m.id]
      )
    ).toEqual([])
    const confirmed = { ...first, state: 'confirmed' as const, confirmedMessageId: 'row-1' }
    expect(reconcileDurableChatSubmissions([confirmed, second], rows, 'session').size).toBe(0)
    expect(
      reconcileDurableChatSubmissions(
        [confirmed, second],
        [...rows, user('row-2', 700)],
        'session'
      ).get('second')?.id
    ).toBe('row-2')
  })
})
