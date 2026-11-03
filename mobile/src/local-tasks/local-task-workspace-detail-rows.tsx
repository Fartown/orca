import type { ReactNode } from 'react'
import { ListTodo } from 'lucide-react-native'
import { ListRow } from '../components/list/ListGroup'
import { colors } from '../theme/mobile-theme'
import type { Worktree } from '../worktree/workspace-list-types'
import { localTasksCopy } from './local-tasks-copy'
import { useLocalTaskForHostRow } from './local-task-host-rows'

// The sheet's own row icon size, so the text lines up with its other rows.
const ICON_SIZE = 16

/**
 * The long-press sheet's row for the local task its workspace belongs to, drawn as the sheet's
 * other link rows: the title, then "SHOP-12 · Local task", or "Can't confirm" for a library out of
 * contact. Tapping it opens the task. None off the host list or for a workspace with no task.
 */
export function useLocalTaskDetailRows(row: Worktree): ReactNode[] {
  const entry = useLocalTaskForHostRow(row)
  if (!entry) {
    return []
  }
  const copy = localTasksCopy()
  const state = entry.live ? copy.workspaceTask : copy.work.sessionStates.unverifiable
  return [
    <ListRow
      key="local-task"
      title={entry.task.title}
      subtitle={`${entry.task.ref} · ${state}`}
      leading={<ListTodo size={ICON_SIZE} color={colors.textSecondary} />}
      onPress={entry.open}
      accessibilityRole="link"
      accessibilityLabel={copy.openWorkspaceTask(entry.task.title)}
    />
  ]
}
