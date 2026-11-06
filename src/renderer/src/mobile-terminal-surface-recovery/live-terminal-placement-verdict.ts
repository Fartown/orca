export function liveTerminalPlacementIsPending(
  liveSessionCount: number,
  placement: { surfaced: boolean; declinedPtyIds: readonly string[] }
): boolean {
  return liveSessionCount > 0 && (!placement.surfaced || placement.declinedPtyIds.length > 0)
}
