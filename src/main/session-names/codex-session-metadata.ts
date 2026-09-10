import { asRecord, extractString, normalizeTitleText } from '../ai-vault/session-scanner-values'

export function isCodexWorkerSession(payload: Record<string, unknown>): boolean {
  const threadSource = extractString(payload.thread_source) ?? extractString(payload.threadSource)
  if (threadSource) {
    return threadSource.toLowerCase() !== 'user'
  }
  const source = asRecord(payload.source)
  return Boolean(asRecord(source?.subagent))
}

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
