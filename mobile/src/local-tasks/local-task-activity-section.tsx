import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Pencil, Send, Trash2, X } from 'lucide-react-native'
import type {
  LocalTaskEvent,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import { formatLocalTaskAgo, localTasksCopy } from './local-tasks-copy'
import { describeLocalTaskEvent } from './local-task-event-copy'
import { localTaskWriteMessage } from './local-task-failure-message'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { localTaskStyles } from './local-tasks-styles'
import { useLocalTaskEvents } from './use-local-tasks-library'

type Props = {
  api: LocalTasksApi
  taskId: string
  eventsVersion: number
  statuses: Map<string, LocalTaskStatusDef>
  now: number
  readOnly: boolean
  canRead: boolean
  onChanged: () => void
}

export function LocalTaskActivitySection(props: Props) {
  const copy = localTasksCopy()
  const {
    events,
    error: eventsError,
    retry
  } = useLocalTaskEvents(props.canRead ? props.api : null, props.taskId, props.eventsVersion)
  const [ids] = useState(() => ({
    add: createLocalTaskOperationIds(),
    edit: createLocalTaskOperationIds(),
    remove: createLocalTaskOperationIds()
  }))
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<LocalTaskEvent | null>(null)
  const [menuFor, setMenuFor] = useState<LocalTaskEvent | null>(null)
  const [removing, setRemoving] = useState<LocalTaskEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const body = draft.trim()
    if (!body || busy) {
      return
    }
    setBusy(true)
    const outcome = editing
      ? await sendLocalTaskWrite(ids.edit, { eventId: editing.id, body }, props.api.editComment)
      : await sendLocalTaskWrite(ids.add, { taskId: props.taskId, body }, props.api.addComment)
    setBusy(false)
    setError(localTaskWriteMessage(copy, outcome))
    if (outcome.kind === 'ok') {
      setDraft('')
      setEditing(null)
      props.onChanged()
    }
  }

  const remove = async (event: LocalTaskEvent) => {
    setRemoving(null)
    const outcome = await sendLocalTaskWrite(
      ids.remove,
      { eventId: event.id },
      props.api.removeComment
    )
    setError(localTaskWriteMessage(copy, outcome))
    if (outcome.kind === 'ok') {
      props.onChanged()
    }
  }

  const ordered = [...events].sort((a, b) => a.createdAt - b.createdAt)
  return (
    <View>
      <Text style={localTaskStyles.sectionLabel}>{copy.activity}</Text>
      {ordered.map((event) => (
        <Pressable
          key={event.id}
          style={styles.entry}
          disabled={event.kind !== 'comment' || props.readOnly}
          onLongPress={() => setMenuFor(event)}
          delayLongPress={350}
        >
          <View style={styles.dot} />
          <View style={styles.entryMain}>
            <Text style={styles.entryText}>
              <Text style={styles.entrySource}>{copy.eventSources[event.source]}</Text>{' '}
              {describeLocalTaskEvent(copy, event, props.statuses)}{' '}
              <Text style={localTaskStyles.meta}>
                {formatLocalTaskAgo(copy, event.createdAt, props.now)}
                {event.editedAt ? ` · ${copy.edited}` : ''}
              </Text>
            </Text>
            {event.kind === 'comment' && event.body ? (
              <View style={styles.bubble}>
                <Text style={localTaskStyles.body}>{event.body}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      ))}
      {eventsError && props.canRead ? (
        <Pressable onPress={retry} accessibilityRole="button" style={styles.error}>
          <Text style={localTaskStyles.errorText}>
            {copy.eventsLoadFailed} · {copy.retry}
          </Text>
        </Pressable>
      ) : null}
      {error ? <Text style={[localTaskStyles.errorText, styles.error]}>{error}</Text> : null}
      {props.readOnly ? null : (
        <View>
          {editing ? (
            <View style={styles.editingRow}>
              <Pencil size={12} color={colors.textMuted} />
              <Text style={localTaskStyles.meta}>{copy.editComment}</Text>
              <View style={localTaskStyles.topBarSpacer} />
              <Pressable
                onPress={() => {
                  setEditing(null)
                  setDraft('')
                }}
                accessibilityRole="button"
                accessibilityLabel={copy.cancel}
                hitSlop={8}
              >
                <X size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composer}>
            <TextInput
              style={[localTaskStyles.bareInput, styles.composerInput]}
              value={draft}
              onChangeText={setDraft}
              placeholder={copy.commentPlaceholder}
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <Pressable
              style={[styles.sendButton, (!draft.trim() || busy) && localTaskStyles.disabled]}
              onPress={() => void submit()}
              disabled={!draft.trim() || busy}
              accessibilityRole="button"
              accessibilityLabel={copy.send}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Send size={16} color={colors.textPrimary} />
              )}
            </Pressable>
          </View>
        </View>
      )}
      <ActionSheetModal
        visible={menuFor !== null}
        actions={[
          {
            label: copy.editComment,
            icon: Pencil,
            onPress: () => {
              setEditing(menuFor)
              setDraft(menuFor?.body ?? '')
            }
          },
          {
            label: copy.deleteComment,
            icon: Trash2,
            destructive: true,
            onPress: () => setRemoving(menuFor)
          }
        ]}
        onClose={() => setMenuFor(null)}
      />
      <ConfirmModal
        visible={removing !== null}
        title={copy.deleteCommentConfirm}
        confirmLabel={copy.delete}
        cancelLabel={copy.cancel}
        destructive
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 6 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.textMuted,
    marginTop: 6
  },
  entryMain: { flex: 1, gap: 6 },
  entryText: { color: colors.textSecondary, fontSize: typography.metaSize + 1, lineHeight: 19 },
  entrySource: { color: colors.textPrimary, fontWeight: '600' },
  bubble: {
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.card,
    padding: spacing.md
  },
  error: { marginTop: spacing.sm },
  editingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    backgroundColor: colors.bgPanel,
    borderRadius: radii.composer,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
