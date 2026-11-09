export function liveTerminalPlacementIsPending(
  liveSessionCount: number,
  placement: { surfaced: boolean; declinedPtyIds: readonly string[] }
): boolean {
  return liveSessionCount > 0 && (!placement.surfaced || placement.declinedPtyIds.length > 0)
}

export function canMintLiveTerminalFallback(ptyId: string): boolean {
  // Local providers treat ordinary numeric session IDs as fresh starts after a restart.
  return !/^\d+$/.test(ptyId)
}
