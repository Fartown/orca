import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { colors } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskDetailScreen } from './local-task-detail-screen'
import type { LocalTaskSite } from './local-task-endpoint'
import { localTaskStyles } from './local-tasks-styles'
import type { LocalTasksLibrary } from './use-local-tasks-library'

export type LocalTaskDetailProps = {
  library: LocalTasksLibrary
  api: LocalTasksApi
  taskId: string
  now: number
  readOnly: boolean
  canRead: boolean
  onBack: () => void
  onOpenTask: (taskId: string) => void
  onEdit: (task: LocalTask) => void
  onAddSubtask: (parent: LocalTask) => void
  site: LocalTaskSite
  /** Opens a linked session's screen; returns why it can't, when it can't. */
  onOpenSession: (taskSessionId: string) => string | null
  onNavigate: (href: string) => void
}

/** A task's page, or why there is none: it was deleted while the page was open. */
export function LocalTaskDetailView(props: LocalTaskDetailProps) {
  const copy = localTasksCopy()
  const insets = useSafeAreaInsets()
  const task = props.library.tasks.find((candidate) => candidate.id === props.taskId) ?? null
  if (task) {
    return <LocalTaskDetailScreen {...props} task={task} />
  }
  return (
    <View style={[localTaskStyles.screen, { paddingTop: insets.top }]}>
      <View style={localTaskStyles.topBar}>
        <Pressable
          style={localTaskStyles.backButton}
          onPress={props.onBack}
          accessibilityRole="button"
        >
          <ChevronLeft size={22} color={colors.textPrimary} />
          <Text style={localTaskStyles.backLabel}>{copy.title}</Text>
        </Pressable>
      </View>
      <View style={localTaskStyles.centered}>
        <Text style={localTaskStyles.centeredText}>{copy.taskMissing}</Text>
      </View>
    </View>
  )
}
