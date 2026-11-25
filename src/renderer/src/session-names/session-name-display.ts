import type { AiVaultSession } from '../../../shared/ai-vault/contracts/ai-vault-types'
import { resolveSessionDisplayTitle } from '../../../shared/session-display-title'
import { resolveScannedSessionDisplayName } from '../../../shared/session-names/scanned-session-display-name'
import { sessionNameSlotCandidates } from '../../../shared/session-names/session-name-slot'
import {
  canonicalSessionTitleKey,
  getCanonicalSessionTitleIndex,
  subscribeCanonicalSessionTitles
} from '../lib/canonical-session-titles'
import { sessionNameStore } from './session-name-store'
import { hasIndependentScannedSessionIdentity } from './scanned-session-name-identity'

let lastRecords: ReturnType<typeof sessionNameStore.getSnapshot> | undefined
let lastManual: ReadonlyMap<string, string> | undefined
let displayIndex: ReadonlyMap<string, string> = new Map()

export function getSessionNameDisplayIndex(): ReadonlyMap<string, string> {
  const records = sessionNameStore.getSnapshot()
  const manual = getCanonicalSessionTitleIndex()
  if (records === lastRecords && manual === lastManual) {
    return displayIndex
  }
  const next = new Map(manual)
  for (const [key, record] of records) {
    const name = resolveSessionDisplayTitle({
      ...sessionNameSlotCandidates(record),
      userTitle: manual.get(key)
    })
    if (name) {
      next.set(key, name.title)
    }
  }
  lastRecords = records
  lastManual = manual
  displayIndex = next
  return displayIndex
}

export function subscribeSessionNameDisplay(listener: () => void): () => void {
  const stopNames = sessionNameStore.subscribe(listener)
  const stopManual = subscribeCanonicalSessionTitles(listener)
  return () => {
    stopNames()
    stopManual()
  }
}

/** Legacy scanner titles have mixed provenance; only qualified evidence is native. */
export function getScannedSessionDisplayName(
  session: AiVaultSession,
  legacyManualTitle?: string | null
): string {
  const key = canonicalSessionTitleKey(session.executionHostId, session.agent, session.sessionId)
  const independentIdentity = hasIndependentScannedSessionIdentity(session)
  return resolveScannedSessionDisplayName(session, {
    cached: independentIdentity ? sessionNameStore.getSnapshot().get(key) : undefined,
    userTitle: independentIdentity
      ? (getCanonicalSessionTitleIndex().get(key) ?? legacyManualTitle)
      : null
  })
}
