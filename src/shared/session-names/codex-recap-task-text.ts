// Why: the hook layer rejects Codex's internal turns structurally — no transcript, see
// codex-title-task-admission. This text match only cleans up names that already leaked:
// a generatedTitle on disk, or an older recap rollout still cached in the vault.
const CODEX_RECAP_PROMPT_PREFIX = 'write a brief catch-up for a user returning to this codex task'

// A leaked prompt is stored after punctuation folding and word-boundary truncation,
// which turns the prefix above into "Write a brief catch up for a user".
const CODEX_RECAP_DERIVED_NAME = /^write a brief catch[-\s]?up for a user\b/

const CODEX_RECAP_SCAN_LIMIT = 128

/** True for Codex's recap turn, as the raw prompt or as a name already derived from it. */
export function isCodexRecapTaskText(text: string | null | undefined): boolean {
  const head = text?.trimStart().slice(0, CODEX_RECAP_SCAN_LIMIT).toLowerCase()
  if (!head) {
    return false
  }
  return head.startsWith(CODEX_RECAP_PROMPT_PREFIX) || CODEX_RECAP_DERIVED_NAME.test(head)
}
