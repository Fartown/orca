import type { ProviderNameEvidence } from '../../shared/session-names/session-name-contract'

type ScannedSessionNameEvidence = {
  providerName?: ProviderNameEvidence
  generatedTitle?: string | null
}

/** The native name evidence a scan carries forward, omitting what the source never recorded. */
export function scannedSessionNameEvidence(
  source: ScannedSessionNameEvidence
): ScannedSessionNameEvidence {
  return {
    ...(source.providerName ? { providerName: source.providerName } : {}),
    ...(source.generatedTitle !== undefined ? { generatedTitle: source.generatedTitle } : {})
  }
}
