type LiveTerminalPlacement = { surfaced: boolean; declinedPtyIds: readonly string[] }

export function liveTerminalPlacementIsPending(
  liveSessionCount: number,
  placement: LiveTerminalPlacement
): boolean {
  return liveSessionCount > 0 && (!placement.surfaced || placement.declinedPtyIds.length > 0)
}

/** Remembers the activation gate's placement attempt, so it withholds seeding a default terminal
 *  while live work on the host is still unplaced or unverifiable. */
export function trackLiveTerminalPlacement(liveSessionCount: number) {
  let placement: LiveTerminalPlacement = { surfaced: false, declinedPtyIds: [] }
  const pending = (): boolean => liveTerminalPlacementIsPending(liveSessionCount, placement)
  return {
    record(adoption: LiveTerminalPlacement): void {
      placement = adoption
    },
    get surfaced(): boolean {
      return placement.surfaced
    },
    get pending(): boolean {
      return pending()
    },
    /** What the gate answers instead of 'empty', which would authorize seeding. */
    emptyOutcome(): 'blocked' | 'empty' {
      return pending() ? 'blocked' : 'empty'
    }
  }
}

export function canMintLiveTerminalFallback(ptyId: string): boolean {
  // Local providers treat ordinary numeric session IDs as fresh starts after a restart.
  return !/^\d+$/.test(ptyId)
}
