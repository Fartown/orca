import {
  isTerminalPanePasteFocusCurrent,
  isTerminalPanePasteTargetCurrent,
  type TerminalPasteTargetState
} from '@/components/terminal-pane/input/paste/terminal-paste-target-state'
import type { TerminalPasteOwnershipFailure } from './terminal-paste-failure'

export function captureTerminalPasteOwnership<
  Transport extends TerminalPasteTargetState['transport']
>({
  readTargetState,
  paneContainer,
  requireFocus,
  activeElement = paneContainer.ownerDocument.activeElement
}: {
  readTargetState: () => Omit<TerminalPasteTargetState, 'transport'> & { transport: Transport }
  paneContainer: Element
  requireFocus: boolean
  activeElement?: Element | null
}): {
  transport: Transport
  ptyId: string | null
  canContinue: () => boolean
  isTargetCurrent: () => boolean
  getFailure: () => TerminalPasteOwnershipFailure
} {
  const captured = readTargetState()
  const focusOwnedAtDispatch = activeElement === null || paneContainer.contains(activeElement)
  let failure: TerminalPasteOwnershipFailure | null = null
  const targetFailure = (): TerminalPasteOwnershipFailure | null => {
    const current = readTargetState()
    const target = { ...captured, manager: current.manager, paneTransports: current.paneTransports }
    if (captured.ptyId && isTerminalPanePasteTargetCurrent(target)) {
      return null
    }
    return captured.transport &&
      current.paneTransports.get(captured.paneId) === captured.transport &&
      !captured.transport.isConnected()
      ? 'target-disconnected'
      : 'target-changed'
  }
  return {
    transport: captured.transport,
    ptyId: captured.ptyId,
    canContinue: (): boolean => targetFailure() === null,
    isTargetCurrent: (): boolean => {
      failure = targetFailure()
      if (failure) {
        return false
      }
      if (
        !isTerminalPanePasteFocusCurrent({
          requireSameFocusedElement: requireFocus,
          activeElementAtDispatch: activeElement,
          focusOwnedAtDispatch,
          paneContainer
        })
      ) {
        failure = 'focus-changed'
        return false
      }
      return true
    },
    getFailure: (): TerminalPasteOwnershipFailure => failure ?? 'target-changed'
  }
}
