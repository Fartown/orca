/** A completed binding publishes selection only for that still-selected pane lifetime. */
export function resolveBoundPaneSelection(args: {
  activeLeafId: string | null
  boundLeafId: string
  sourcePaneId: number | undefined
  selectedPane: { id: number; leafId: string } | null | undefined
}): string | null {
  return args.selectedPane?.id === args.sourcePaneId &&
    args.selectedPane?.leafId === args.boundLeafId
    ? args.boundLeafId
    : args.activeLeafId
}
