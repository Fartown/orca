import { View } from 'react-native'
import { ListTodo } from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'
import type { Worktree } from '../worktree/workspace-list-types'
import { localTasksCopy } from './local-tasks-copy'
import { useLocalTaskForHostRow } from './local-task-host-rows'

/**
 * A host-list row's task icon, after upstream's presence glyphs, for a workspace that belongs to a
 * local task. It follows the desktop's Display properties → Local task, which the host reports in
 * its status, as upstream's glyphs follow the card properties; the task's title is its name.
 */
export function LocalTaskWorkspaceGlyph({ item }: { item: Worktree }) {
  const entry = useLocalTaskForHostRow(item)
  if (!entry?.glyphShown) {
    return null
  }
  return (
    <View accessible accessibilityLabel={localTasksCopy().workspaceTaskGlyph(entry.task.title)}>
      <ListTodo size={11} color={colors.textMuted} />
    </View>
  )
}
