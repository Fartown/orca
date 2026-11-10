import { Pressable, ScrollView, Text, View } from 'react-native'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import type { LocalTaskSite } from './local-task-endpoint'
import {
  LocalTaskNeedsYouList,
  localTaskBasicCardContext,
  type LocalTaskCardContext
} from './local-task-needs-you-list'
import type { LocalTaskAttentionRow } from './local-task-progress-projection'
import { localTaskStyles } from './local-tasks-styles'
import type { LocalTasksLibrary } from './use-local-tasks-library'

type Props = {
  library: LocalTasksLibrary
  api: LocalTasksApi
  site: Pick<LocalTaskSite, 'client' | 'connState' | 'label'>
  rows: LocalTaskAttentionRow[]
  now: number
  /** Marking seen and snoozing need a live, writable library; a reply writes nothing there. */
  canWrite: boolean
  bottomInset: number
  onOpenTask: (taskId: string) => void
  onOpenSession: (taskSessionId: string) => void
  /** A chat session previews in a drawer; without one, Preview opens the session. */
  onPreview?: (taskSessionId: string) => void
  context?: LocalTaskCardContext
}

/** The "Needs you" segment: only the band the All list leads with, or why it is empty. */
export function LocalTasksAttentionView(props: Props) {
  const copy = localTasksCopy()
  const work = copy.work
  const snapshot = props.library.work.progress
  const connected = props.site.connState === 'connected'

  if (props.library.work.error && !snapshot) {
    return (
      <View style={localTaskStyles.centered}>
        <Text style={localTaskStyles.centeredText}>{work.workLoadFailed}</Text>
        <Pressable
          style={localTaskStyles.secondaryButton}
          accessibilityRole="button"
          onPress={props.library.retryFailed}
        >
          <Text style={localTaskStyles.secondaryButtonText}>{copy.retry}</Text>
        </Pressable>
      </View>
    )
  }
  const message = !snapshot
    ? work.attentionLoading
    : props.rows.length === 0
      ? !connected
        ? work.attentionUnverifiable(props.site.label)
        : snapshot.sessions.some((session) => session.state === 'unverifiable')
          ? work.attentionUnverifiableHosts
          : work.attentionEmpty
      : null
  if (message) {
    return (
      <View style={localTaskStyles.centered}>
        <Text style={localTaskStyles.centeredText} testID="local-tasks-attention-message">
          {message}
        </Text>
      </View>
    )
  }
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: props.bottomInset + 96 }}>
      {connected ? null : (
        <Text
          style={[localTaskStyles.hint, localTaskStyles.attentionStale]}
          testID="local-tasks-attention-stale"
        >
          {work.attentionUnverifiable(props.site.label)}
        </Text>
      )}
      <LocalTaskNeedsYouList
        library={props.library}
        api={props.api}
        site={props.site}
        rows={props.rows}
        now={props.now}
        canWrite={props.canWrite}
        context={props.context ?? localTaskBasicCardContext(props.site.label)}
        onOpenTask={props.onOpenTask}
        onPreview={props.onPreview ?? props.onOpenSession}
        onOpenSession={props.onOpenSession}
      />
    </ScrollView>
  )
}
