export type SessionDisplayTitleSource =
  | 'user'
  | 'provider'
  | 'provider-snapshot'
  | 'generated'
  | 'live'
  | 'identity-fallback'

export type SessionDisplayTitleResult = {
  title: string
  source: SessionDisplayTitleSource
}

export type SessionDisplayTitleCandidates = {
  userTitle?: string | null
  providerTitle?: string | null
  providerTitleSnapshot?: string | null
  generatedTitle?: string | null
  liveTitle?: string | null
  identityFallbackTitle?: string | null
}

/** Resolves automatic names without letting an identity fallback mask semantic titles. */
export function resolveSessionDisplayTitle(
  candidates: SessionDisplayTitleCandidates
): SessionDisplayTitleResult | null {
  const fallback = normalized(candidates.identityFallbackTitle)
  const ranked: [SessionDisplayTitleSource, string | null][] = [
    ['user', normalized(candidates.userTitle)],
    ['provider', withoutFallback(candidates.providerTitle, fallback)],
    ['provider-snapshot', withoutFallback(candidates.providerTitleSnapshot, fallback)],
    ['generated', normalized(candidates.generatedTitle)],
    ['live', normalized(candidates.liveTitle)],
    ['identity-fallback', fallback]
  ]
  for (const [source, title] of ranked) {
    if (title) {
      return { title, source }
    }
  }
  return null
}

function withoutFallback(value: string | null | undefined, fallback: string | null): string | null {
  const title = normalized(value)
  return title && title !== fallback ? title : null
}

function normalized(value: string | null | undefined): string | null {
  const title = value?.trim()
  return title ? title : null
}
