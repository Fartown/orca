import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { LocalTaskAttentionItem } from '../../../src/shared/local-tasks/local-task-link-types'
import {
  LOCAL_TASK_SNOOZE_PRESETS,
  localTaskSnoozeUntil
} from '../../../src/shared/local-tasks/local-task-snooze-presets'
import { ActionSheetModal } from '../components/ActionSheetModal'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskAttentionCard, localTaskAttentionLine } from './local-task-attention-row'
import type { LocalTaskSite } from './local-task-endpoint'
import type { LocalTaskAttentionRow } from './local-task-progress-projection'
import { LocalTaskReplyDrawer } from './local-task-reply-drawer'
import { LocalTaskSwipeRow } from './local-task-swipe-row'
import { localTaskStyles } from './local-tasks-styles'
import {
  useLocalTaskAttentionActions,
  type LocalTaskAttentionActions
} from './use-local-task-attention-actions'
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
  onOpenSession: (item: LocalTaskAttentionItem) => void
}

/** "Needs you": the library host's judgement, one row per task, swipe for seen or snooze. */
export function LocalTasksAttentionView(props: Props) {
  const copy = localTasksCopy()
  const work = copy.work
  const actions = useLocalTaskAttentionActions({
    api: props.api,
    library: props.library,
    client: props.site.client,
    copy
  })
  const [snoozing, setSnoozing] = useState<LocalTaskAttentionItem[] | null>(null)
  const [menuFor, setMenuFor] = useState<LocalTaskAttentionRow | null>(null)
  const [replying, setReplying] = useState<{ item: LocalTaskAttentionItem; ref: string } | null>(
    null
  )
  // Why kept per item in memory: a reply the agent never got must not lose what the user wrote.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
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
      ? connected
        ? work.attentionEmpty
        : work.attentionUnverifiable(props.site.label)
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
  const handlers = {
    errors: actions.errors,
    replyFor: (itemKey: string) => actions.replies[itemKey] ?? null,
    onOpenSession: props.onOpenSession,
    onReply: (item: LocalTaskAttentionItem) => {
      const row = props.rows.find((entry) => entry.items.includes(item))
      setReplying({ item, ref: row?.task.ref ?? '' })
    }
  }
  const now = new Date(props.now)
  const swipeActions = (row: LocalTaskAttentionRow) =>
    props.canWrite
      ? [
          {
            label: work.markSeen,
            tone: 'neutral' as const,
            onPress: () => void actions.markSeen(row.items)
          },
          { label: work.snooze, tone: 'accent' as const, onPress: () => setSnoozing(row.items) }
        ]
      : []
  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: props.bottomInset + 96 }}>
        {connected ? null : (
          <Text
            style={[localTaskStyles.hint, localTaskStyles.attentionStale]}
            testID="local-tasks-attention-stale"
          >
            {work.attentionUnverifiable(props.site.label)}
          </Text>
        )}
        {props.rows.map((row) => (
          <LocalTaskSwipeRow key={row.task.id} actions={swipeActions(row)}>
            <LocalTaskAttentionCard
              row={row}
              now={props.now}
              handlers={handlers}
              onOpenTask={props.onOpenTask}
              onMore={() => (props.canWrite ? setMenuFor(row) : undefined)}
            />
          </LocalTaskSwipeRow>
        ))}
      </ScrollView>
      <ActionSheetModal
        visible={menuFor !== null}
        title={menuFor ? `${menuFor.task.ref} · ${work.itemActions}` : undefined}
        actions={[
          { label: work.markSeen, onPress: () => menuFor && void actions.markSeen(menuFor.items) },
          { label: work.snooze, onPress: () => menuFor && setSnoozing(menuFor.items) }
        ]}
        onClose={() => setMenuFor(null)}
      />
      <ActionSheetModal
        visible={snoozing !== null}
        title={work.snoozeTitle}
        actions={LOCAL_TASK_SNOOZE_PRESETS.filter(
          (choice) => localTaskSnoozeUntil(choice, now) !== null
        ).map((choice) => ({
          label: work.snoozeChoices[choice],
          onPress: () => snoozing && void actions.snooze(snoozing, choice)
        }))}
        onClose={() => setSnoozing(null)}
      />
      <LocalTaskReplyDrawer
        visible={replying !== null}
        title={replying ? work.replyTitle(replying.ref) : ''}
        message={replying ? localTaskAttentionLine(replying.item) : undefined}
        draft={replying ? (drafts[replying.item.key] ?? '') : ''}
        connected={connected}
        onChangeDraft={(draft) => {
          const key = replying?.item.key
          if (key) {
            setDrafts((previous) => ({ ...previous, [key]: draft }))
          }
        }}
        onSend={(text) => {
          const target = replying
          setReplying(null)
          if (target) {
            sendReply(actions, target.item, text, setDrafts)
          }
        }}
        onClose={() => setReplying(null)}
      />
    </>
  )
}

/** Empties the draft as the send goes out; only a send nothing received puts the text back. */
function sendReply(
  actions: LocalTaskAttentionActions,
  item: LocalTaskAttentionItem,
  text: string,
  setDrafts: (update: (previous: Record<string, string>) => Record<string, string>) => void
) {
  const key = item.key
  setDrafts(({ [key]: _sent, ...rest }) => rest)
  void actions.reply(item, text).then((outcome) => {
    if (outcome.kind === 'not-sent') {
      setDrafts((previous) => ({
        ...previous,
        [key]: previous[key] ? `${text}\n${previous[key]}` : text
      }))
    }
  })
}
