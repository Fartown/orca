import { isEligibleSessionNamePrompt } from './session-names/session-name-candidate-quality'

export type SessionDisplayTitleSource =
  | 'user'
  | 'provider'
  | 'provider-snapshot'
  | 'generated'
  | 'live'
  | 'label'
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
  labelTitle?: string | null
  identityFallbackTitle?: string | null
}

/** Resolves automatic names without letting an identity fallback mask semantic titles. */
export function resolveSessionDisplayTitle(
  candidates: SessionDisplayTitleCandidates
): SessionDisplayTitleResult | null {
  const fallback = normalized(candidates.identityFallbackTitle)
  const ranked: [SessionDisplayTitleSource, string | null][] = [
    ['provider', withoutFallback(candidates.providerTitle, fallback)],
    ['provider-snapshot', withoutFallback(candidates.providerTitleSnapshot, fallback)],
    ['user', normalized(candidates.userTitle)],
    ['generated', eligiblePromptTitle(candidates.generatedTitle)],
    ['live', normalized(candidates.liveTitle)],
    ['label', normalized(candidates.labelTitle)],
    ['identity-fallback', fallback]
  ]
  for (const [source, title] of ranked) {
    if (title) {
      return { title, source }
    }
  }
  return null
}

function eligiblePromptTitle(value: string | null | undefined): string | null {
  const title = normalized(value)
  return title && isEligibleSessionNamePrompt(title) ? title : null
}

function withoutFallback(value: string | null | undefined, fallback: string | null): string | null {
  const title = normalized(value)
  return title && title !== fallback ? title : null
}

function normalized(value: string | null | undefined): string | null {
  const title = value?.trim()
  return title ? title : null
}
