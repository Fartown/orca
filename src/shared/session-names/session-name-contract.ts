export type ProviderNameEvidence =
  | { kind: 'named'; title: string; field: string }
  | { kind: 'absent' }
  | { kind: 'cleared' }
  | { kind: 'unavailable' }

export type SessionNameEvidence = {
  agent: 'claude' | 'codex'
  sessionId: string
  providerName: ProviderNameEvidence
  generatedTitle?: string | null
}

export type ProviderNameReader = (
  sessionId: string
) => Promise<string | null | ProviderNameEvidence>

export async function readProviderNameEvidence(
  read: ProviderNameReader | undefined,
  sessionId: string,
  field: string
): Promise<ProviderNameEvidence> {
  if (!read) {
    return { kind: 'unavailable' }
  }
  try {
    const value = await read(sessionId)
    if (typeof value === 'string') {
      return value.trim() ? { kind: 'named', title: value.trim(), field } : { kind: 'absent' }
    }
    return value ?? { kind: 'absent' }
  } catch {
    return { kind: 'unavailable' }
  }
}

export function parseProviderNameEvidence(value: unknown): ProviderNameEvidence | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  if (record.kind === 'absent' || record.kind === 'cleared' || record.kind === 'unavailable') {
    return { kind: record.kind }
  }
  if (
    record.kind === 'named' &&
    typeof record.title === 'string' &&
    record.title.trim() &&
    record.title.length <= 512 &&
    typeof record.field === 'string' &&
    record.field.trim() &&
    record.field.length <= 128
  ) {
    return { kind: 'named', title: record.title.trim(), field: record.field.trim() }
  }
  return undefined
}

/** Missing or unreadable evidence is not a provider rename or revocation. */
export function retainConfirmedProviderName(
  previous: ProviderNameEvidence | undefined,
  observation: ProviderNameEvidence
): ProviderNameEvidence {
  return (observation.kind === 'absent' || observation.kind === 'unavailable') &&
    previous?.kind === 'named'
    ? previous
    : observation
}

export function providerNameEvidenceEqual(
  left: ProviderNameEvidence | undefined,
  right: ProviderNameEvidence | undefined
): boolean {
  if (left?.kind !== right?.kind) {
    return false
  }
  return (
    left?.kind !== 'named' ||
    (right?.kind === 'named' && left.title === right.title && left.field === right.field)
  )
}
