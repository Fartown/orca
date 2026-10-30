import type { ComponentType, ReactNode } from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'
import { ListTodo } from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'
import type { Worktree } from '../worktree/workspace-list-types'
import { localTasksCopy } from './local-tasks-copy'
import { useLocalTaskForHostRow } from './local-task-host-rows'

type DetailRowProps = {
  icon: ReactNode
  children: ReactNode
  onPress?: () => void
  accessibilityLabel?: string
}

type DetailTextStyles = { title: StyleProp<TextStyle>; meta: StyleProp<TextStyle> }

// The sheet's own row icon size, so the text lines up with its other rows.
const ICON_SIZE = 16

/**
 * The long-press sheet's row for the local task its workspace belongs to, drawn with the sheet's
 * own row and text styles: the title, then "SHOP-12 · Local task", or "Can't confirm" for a library
 * out of contact. Tapping it opens the task. None off the host list or for a workspace with no task.
 */
export function useLocalTaskDetailRows(
  row: Worktree,
  DetailRow: ComponentType<DetailRowProps>,
  styles: DetailTextStyles
): ReactNode[] {
  const entry = useLocalTaskForHostRow(row)
  if (!entry) {
    return []
  }
  const copy = localTasksCopy()
  const state = entry.live ? copy.workspaceTask : copy.work.sessionStates.unverifiable
  return [
    <DetailRow
      key="local-task"
      icon={<ListTodo size={ICON_SIZE} color={colors.textSecondary} />}
      onPress={entry.open}
      accessibilityLabel={copy.openWorkspaceTask(entry.task.title)}
    >
      <Text style={styles.title} numberOfLines={1}>
        {entry.task.title}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {`${entry.task.ref} · ${state}`}
      </Text>
    </DetailRow>
  ]
}
