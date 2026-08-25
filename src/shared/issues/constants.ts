export const ISSUE_MAX_DEPTH = 3
export const ORCA_ISSUES_RUNTIME_CAPABILITY = 'orca-issues.v1' as const

export const ISSUE_STATES = ['active', 'archived'] as const
export const ROUND_RECORD_KINDS = ['completion', 'waiting'] as const
export const ROUND_WAITING_REASONS = ['question', 'approval', 'blocked', 'other'] as const
export const ROUND_RECORD_STATE_SOURCES = ['hook', 'reconciled'] as const
export const ROUND_TEXT_COMPLETENESS = [
  'not-captured',
  'runtime-preview',
  'reconciled-preview'
] as const
export const ROUND_RESOLUTIONS = ['new-input', 'explicit', 'archive', 'resumed'] as const

export const ROUND_TEXT_PREVIEW_MAX_BYTES = 8 * 1024
export const ISSUE_LIST_PAGE_MAX_RECORDS = 500
export const ISSUE_LIST_PAGE_MAX_BYTES = 1024 * 1024
export const ISSUE_CURSOR_MAX_BYTES = 2 * 1024
export const ISSUE_NOTE_MAX_BYTES = 32 * 1024
export const ISSUE_TITLE_MAX_BYTES = 512
export const LAUNCH_TOKEN_MIN_LENGTH = 32
export const LAUNCH_TOKEN_MAX_LENGTH = 256
