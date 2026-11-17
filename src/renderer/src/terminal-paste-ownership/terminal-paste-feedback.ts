import {
  clearPaneTerminalError,
  type TerminalErrorsByPaneId
} from '@/components/terminal-pane/terminal-error-accumulation'
import { formatTerminalPasteExecutionError } from '@/components/terminal-pane/terminal-paste-errors'
import type { TerminalPasteExecutionReason } from '@/components/terminal-pane/terminal-paste-model'
import { formatTerminalPasteOwnershipFailure } from './terminal-paste-failure'

export function clearRecoveredTerminalPasteErrors(
  errors: TerminalErrorsByPaneId,
  paneId: number
): TerminalErrorsByPaneId {
  const reasons: (TerminalPasteExecutionReason | undefined)[] = [
    undefined,
    'operation-timeout',
    'paste-rejected',
    'payload-too-large',
    'pty-writer-unavailable',
    'stale-target',
    'target-disconnected'
  ]
  const recoveredMessages = new Set([
    ...reasons.map(formatTerminalPasteExecutionError),
    formatTerminalPasteOwnershipFailure('focus-changed'),
    formatTerminalPasteOwnershipFailure('target-disconnected')
  ])
  let next = errors
  for (const message of errors[paneId] ?? []) {
    if (recoveredMessages.has(message) || message.startsWith('Image paste failed: ')) {
      next = clearPaneTerminalError(next, paneId, message)
    }
  }
  return next
}
