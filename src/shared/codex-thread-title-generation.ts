const CODEX_THREAD_TITLE_PROMPT_PREFIX = 'Generate a concise, single-line task title of at most '
const CODEX_THREAD_TITLE_PROMPT_MARKER = 'Start with an imperative verb.'

export function isCodexThreadTitleGenerationPrompt(prompt: string | null | undefined): boolean {
  const text = prompt?.trimStart()
  return Boolean(
    text?.startsWith(CODEX_THREAD_TITLE_PROMPT_PREFIX) &&
    text.includes(CODEX_THREAD_TITLE_PROMPT_MARKER)
  )
}

export function isCodexThreadTitleGenerationOutput(output: string | null | undefined): boolean {
  if (!output) {
    return false
  }
  try {
    const parsed = JSON.parse(output) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false
    }
    const record = parsed as Record<string, unknown>
    return (
      Object.keys(record).length === 1 &&
      typeof record.title === 'string' &&
      record.title.trim().length > 0
    )
  } catch {
    return false
  }
}
