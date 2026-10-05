import { beforeAll, expect, it, vi } from 'vitest'
import { AI_VAULT_SERVICE_PROTOCOL_VERSION } from '../ai-vault/session-scanner-service-protocol'

const scanAiVaultSessions = vi.hoisted(() => vi.fn())

vi.mock('../ai-vault/session-scanner', () => ({ scanAiVaultSessions }))
vi.mock('../ai-vault/session-parse-cache-persistence', () => ({
  flushSessionParseCachePersist: vi.fn(() => Promise.resolve()),
  initSessionParseCachePersistence: vi.fn()
}))

const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const sent: { type: string; id?: number; value?: unknown }[] = []

function emit(message: unknown): void {
  process.emit('message', message as never, undefined as never)
}

async function request(id: number, body: Record<string, unknown>): Promise<unknown> {
  emit({ type: 'request', id, ...body })
  await vi.waitFor(() => expect(sent.some((message) => message.id === id)).toBe(true))
  return sent.find((message) => message.id === id)
}

beforeAll(async () => {
  process.send = ((message: { type: string; id?: number }) => {
    sent.push(message)
    return true
  }) as typeof process.send
  await import('../ai-vault/session-scanner-service-entry')
  emit({ type: 'init', protocol: AI_VAULT_SERVICE_PROTOCOL_VERSION })
})

it('keeps scanned native name evidence in the service title cache', async () => {
  const providerName = { kind: 'named', title: 'Native name', field: 'custom-title' }
  scanAiVaultSessions.mockResolvedValue({
    sessions: [
      {
        agent: 'claude',
        sessionId: SESSION_ID,
        title: 'Prompt fallback',
        providerName,
        generatedTitle: 'Generated'
      }
    ],
    issues: [],
    scannedAt: '2026-10-05'
  })
  await request(1, { operation: 'scan', options: {} })
  const result = await request(2, {
    operation: 'titles',
    requests: [{ agent: 'claude', sessionId: SESSION_ID }]
  })
  expect(result).toMatchObject({
    type: 'result',
    value: {
      titles: [
        {
          agent: 'claude',
          sessionId: SESSION_ID,
          title: 'Prompt fallback',
          providerName,
          generatedTitle: 'Generated'
        }
      ]
    }
  })
})
