import { statusHeadCategory, type LocalTaskBoardColumn } from './local-task-list-groups'

const COLUMN_ORDER = ['started', 'review', 'unstarted', 'completed', 'backlog', 'canceled'] as const

/** The keyboard and the board use the same left-to-right order. */
export function orderLocalTaskBoardColumns(
  columns: readonly LocalTaskBoardColumn[]
): LocalTaskBoardColumn[] {
  return columns.toSorted(
    (a, b) =>
      COLUMN_ORDER.indexOf(statusHeadCategory(a)) - COLUMN_ORDER.indexOf(statusHeadCategory(b))
  )
}
