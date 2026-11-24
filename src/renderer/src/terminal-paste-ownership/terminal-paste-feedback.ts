import {
  appendPaneTerminalError,
  clearPaneTerminalError,
  type TerminalErrorsByPaneId
} from '@/components/terminal-pane/errors/terminal-error-accumulation'
import { formatTerminalPasteExecutionError } from '@/components/terminal-pane/input/paste/terminal-paste-errors'
import type { TerminalPasteExecutionReason } from '@/components/terminal-pane/input/paste/terminal-paste-model'
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
  for (const { message } of errors[paneId] ?? []) {
    if (recoveredMessages.has(message) || message.startsWith('Image paste failed: ')) {
      next = clearPaneTerminalError(next, paneId, message)
    }
  }
  return next
}

type TerminalPasteErrorSink = (
  update: (current: TerminalErrorsByPaneId) => TerminalErrorsByPaneId
) => void

const operationsByErrorSink = new WeakMap<TerminalPasteErrorSink, Map<number, object>>()

export function createTerminalPasteFeedback(setErrors: TerminalPasteErrorSink) {
  const latestOperations = operationsByErrorSink.get(setErrors) ?? new Map<number, object>()
  operationsByErrorSink.set(setErrors, latestOperations)
  return (paneId: number) => {
    const operation = {}
    latestOperations.set(paneId, operation)
    return {
      fail: (message: string): void => {
        if (latestOperations.get(paneId) === operation) {
          setErrors((current) => appendPaneTerminalError(current, paneId, message))
        }
      },
      succeed: (): void => {
        if (latestOperations.get(paneId) === operation) {
          setErrors((current) => clearRecoveredTerminalPasteErrors(current, paneId))
        }
      }
    }
  }
}
