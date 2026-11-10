import { useState } from 'react'
import { View } from 'react-native'
import { buildLocalTaskIndex } from '../../../src/shared/local-tasks/local-task-grouping'
import type { LocalTaskAttentionItem } from '../../../src/shared/local-tasks/local-task-link-types'
import {
  LOCAL_TASK_SNOOZE_PRESETS,
  localTaskSnoozeUntil
} from '../../../src/shared/local-tasks/local-task-snooze-presets'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { ActionSheetModal } from '../components/ActionSheetModal'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskAttentionCard, localTaskAttentionLine } from './local-task-attention-row'
import { localTaskCardStyles } from './local-task-card'
import { localTaskCardFacts } from './local-task-card-facts'
import type { LocalTaskSite } from './local-task-endpoint'
import { localTaskStatusLookup } from './local-task-list-projection'
import type { LocalTaskAttentionRow } from './local-task-progress-projection'
import { LocalTaskReplyDrawer } from './local-task-reply-drawer'
import { LocalTaskSwipeRow } from './local-task-swipe-row'
import { localTaskStyles } from './local-tasks-styles'
import {
  useLocalTaskAttentionActions,
  type LocalTaskAttentionActions
} from './use-local-task-attention-actions'
import type { LocalTasksLibrary } from './use-local-tasks-library'

/** How cards name hosts and PRs: from what the page read, never by asking a host per card. */
export type LocalTaskCardContext = {
  hostName: (ownerHostId: string, snapshotLabel: string | null) => string
  hostConnected: (ownerHostId: string) => boolean | null
  reviewDetail: (task: LocalTask) => string | null
}

/** Names only the library's own machine; other hosts by the label their link recorded. */
export function localTaskBasicCardContext(libraryLabel: string): LocalTaskCardContext {
  return {
    hostName: (hostId, snapshot) => (hostId === 'local' ? libraryLabel : (snapshot ?? '')),
    hostConnected: () => null,
    reviewDetail: () => null
  }
}

/**
 * The "Needs you" cards with everything they open: snooze choices, the long-press menu, and the
 * reply box for a finished turn. Swiping a card marks it seen or snoozes it whole.
 */
export function LocalTaskNeedsYouList(props: {
  library: LocalTasksLibrary
  api: LocalTasksApi
  site: Pick<LocalTaskSite, 'client' | 'connState' | 'label'>
  rows: readonly LocalTaskAttentionRow[]
  now: number
  canWrite: boolean
  context: LocalTaskCardContext
  onOpenTask: (taskId: string) => void
  onPreview: (taskSessionId: string) => void
  onOpenSession: (taskSessionId: string) => void
}) {
  const copy = localTasksCopy()
  const work = copy.work
  const { library } = props
  const actions = useLocalTaskAttentionActions({
    api: props.api,
    library,
    client: props.site.client,
    copy
  })
  const [snoozing, setSnoozing] = useState<LocalTaskAttentionItem[] | null>(null)
  const [menuFor, setMenuFor] = useState<LocalTaskAttentionRow | null>(null)
  const [replying, setReplying] = useState<{ item: LocalTaskAttentionItem; title: string } | null>(
    null
  )
  // Why kept per item in memory: a reply the agent never got must not lose what the user wrote.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const connected = props.site.connState === 'connected'
  const index = buildLocalTaskIndex(library.projects, library.tasks)
  const lookup = localTaskStatusLookup(library.projects)
  const handlers = {
    errors: actions.errors,
    replyFor: (itemKey: string) => actions.replies[itemKey] ?? null,
    onPreview: props.onPreview,
    onOpenSession: props.onOpenSession,
    onReply: (item: LocalTaskAttentionItem) => {
      const row = props.rows.find((entry) => entry.items.includes(item))
      setReplying({ item, title: row?.task.title ?? '' })
    },
    canWrite: props.canWrite,
    onSnooze: (items: LocalTaskAttentionItem[]) => setSnoozing(items)
  }
  const now = new Date(props.now)
  const swipeActions = (row: LocalTaskAttentionRow) =>
    props.canWrite && row.items.length > 0
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
      <View style={[localTaskStyles.card, localTaskCardStyles.group]}>
        {props.rows.map((row, at) => (
          <LocalTaskSwipeRow key={row.task.id} actions={swipeActions(row)}>
            <LocalTaskAttentionCard
              row={row}
              facts={localTaskCardFacts({
                task: row.task,
                index,
                links: library.work.links,
                snapshot: library.work.progress,
                inContact: connected,
                hostName: props.context.hostName,
                hostConnected: props.context.hostConnected
              })}
              status={lookup.get(row.task.statusId) ?? null}
              reviewDetail={row.review ? props.context.reviewDetail(row.task) : null}
              now={props.now}
              first={at === 0}
              handlers={handlers}
              onOpenTask={props.onOpenTask}
              onMore={() => (props.canWrite && row.items.length > 0 ? setMenuFor(row) : undefined)}
            />
          </LocalTaskSwipeRow>
        ))}
      </View>
      <ActionSheetModal
        visible={menuFor !== null}
        title={menuFor ? menuFor.task.title : undefined}
        actions={[
          { label: work.markSeen, onPress: () => menuFor && void actions.markSeen(menuFor.items) },
          { label: work.snooze, onPress: () => menuFor && setSnoozing(menuFor.items) }
        ]}
        onClose={() => setMenuFor(null)}
      />
      {/* No "Pick a time…" here: the phone has no date-time picker to offer one with. */}
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
        title={replying ? work.replyTitle(replying.title) : ''}
        message={replying ? localTaskAttentionLine(replying.item) : undefined}
        draft={replying ? (drafts[replying.item.key] ?? '') : ''}
        connected={connected}
        hostLabel={props.site.label}
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
