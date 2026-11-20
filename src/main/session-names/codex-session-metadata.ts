import { extractString } from '../../shared/text/trimmed-string'
import { normalizeTitleText } from '../ai-vault/parsing/session-scanner-text-normalization'

export function extractCodexSessionMetadataTitle(
  payload: Record<string, unknown>
): { title: string; field: string } | null {
  for (const field of ['title', 'thread_name', 'threadName']) {
    const title = normalizeTitleText(extractString(payload[field]) ?? '')
    if (title) {
      return { title, field: `session_meta.${field}` }
    }
  }
  return null
}
