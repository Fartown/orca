export function assertNumericReattachMaySpawn(args: {
  sessionId?: string
  requestedPtyId?: string
  absentOwnerPtyId?: string
  stoppedPtyId?: string
}): void {
  if (
    args.sessionId &&
    /^\d+$/.test(args.sessionId.trim()) &&
    (!args.requestedPtyId ||
      (args.requestedPtyId !== args.absentOwnerPtyId && args.requestedPtyId !== args.stoppedPtyId))
  ) {
    throw new Error('terminal_pane_owner_unverified')
  }
}
