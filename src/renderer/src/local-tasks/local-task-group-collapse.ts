import type { LocalTaskGroupHead } from './local-task-list-groups'
import { statusHeadCategory } from './local-task-list-groups'

/** Closed work starts folded so the list opens on what is still moving. */
function startsCollapsed(head: LocalTaskGroupHead): boolean {
  if (head.kind !== 'status' && head.kind !== 'category') {
    return false
  }
  const category = statusHeadCategory(head)
  return category === 'completed' || category === 'canceled'
}

/** A toggled key flips the group's starting state, so Completed opens with one click like others close. */
export function isLocalTaskGroupCollapsed(
  head: LocalTaskGroupHead,
  toggledKeys: readonly string[]
): boolean {
  return toggledKeys.includes(head.key) !== startsCollapsed(head)
}
