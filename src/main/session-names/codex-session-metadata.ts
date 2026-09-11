import { extractString, normalizeTitleText } from '../ai-vault/session-scanner-values'

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
