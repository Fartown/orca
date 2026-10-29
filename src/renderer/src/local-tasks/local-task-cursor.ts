/**
 * Where the cursor goes once a fold or a collapsed group hides its row: the nearest shown row
 * above it (a folded parent, or the last row before a collapsed group), else the first below.
 * A cursor on a row the list never had (filtered out, another view) stays where it is.
 */
export function clampLocalTaskCursor(
  cursor: string | null,
  allIds: readonly string[],
  shownIds: readonly string[]
): string | null {
  const shown = new Set(shownIds)
  if (cursor === null || shown.has(cursor)) {
    return cursor
  }
  const at = allIds.indexOf(cursor)
  if (at === -1) {
    return cursor
  }
  const above = allIds.slice(0, at).findLast((id) => shown.has(id))
  return above ?? allIds.slice(at + 1).find((id) => shown.has(id)) ?? null
}
