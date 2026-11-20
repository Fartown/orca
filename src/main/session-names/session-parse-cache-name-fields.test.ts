import { describe, expect, it } from 'vitest'
import type { AiVaultSession } from '../../shared/ai-vault/contracts/ai-vault-types'

/**
 * Parse-cache rows replay straight into Agent Session History, so
 * `SESSION_PARSE_CACHE_SCHEMA_VERSION` is the only signal that a persisted row
 * is stale. Changing the persisted session shape — including the session-name
 * evidence fields — breaks this `satisfies`; the fix is to decide whether the
 * schema version in parse-cache/session-parse-cache-database.ts must be bumped,
 * not to silently extend the list.
 */
const CACHED_SESSION_FIELDS = {
  accountHome: true,
  accountWslDistro: true,
  id: true,
  executionHostId: true,
  executionHostPlatform: true,
  agent: true,
  sessionId: true,
  title: true,
  titleKind: true,
  providerName: true,
  generatedTitle: true,
  cwd: true,
  cwdAliases: true,
  branch: true,
  model: true,
  filePath: true,
  codexHome: true,
  createdAt: true,
  updatedAt: true,
  modifiedAt: true,
  messageCount: true,
  totalTokens: true,
  previewMessages: true,
  previewMessagesTruncated: true,
  antigravityOpeningPrompt: true,
  antigravityArtifactPath: true,
  firstUserPrompt: true,
  lastUserPrompt: true,
  queuedMessageCount: true,
  subagentTranscriptCount: true,
  resumeCommand: true,
  subagent: true,
  structuredSession: true,
  hostPairingRevision: true
} satisfies Record<keyof AiVaultSession, true>

describe('cached session compatibility', () => {
  it('pins the persisted session shape, including name evidence, to the parse-cache schema', () => {
    expect(CACHED_SESSION_FIELDS.providerName).toBe(true)
    expect(CACHED_SESSION_FIELDS.generatedTitle).toBe(true)
  })
})
