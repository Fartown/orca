import { translate } from '@/i18n/i18n'

export type TerminalPasteOwnershipFailure =
  | 'focus-changed'
  | 'target-changed'
  | 'target-disconnected'

export function formatTerminalPasteOwnershipFailure(
  failure: TerminalPasteOwnershipFailure
): string {
  if (failure === 'focus-changed') {
    return translate(
      'terminalPasteOwnership.focusChanged',
      'Paste cancelled: input focus does not match the target terminal.'
    )
  }
  if (failure === 'target-disconnected') {
    return translate(
      'terminalPasteOwnership.disconnected',
      'Paste cancelled: terminal disconnected before paste completed.'
    )
  }
  return translate(
    'terminalPasteOwnership.targetChanged',
    'Paste cancelled: terminal target changed before paste completed.'
  )
}
