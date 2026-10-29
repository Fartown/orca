import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { BottomDrawer } from '../components/BottomDrawer'
import { TEXT_INPUT_FONT_SIZE } from '../platform/text-input-font-size'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'

/**
 * The reply box of one "Needs you" item. The draft is the caller's, so closing keeps it; out of
 * contact the box is disabled and says it is reconnecting, as the phone's chat composer does.
 */
export function LocalTaskReplyDrawer(props: {
  visible: boolean
  title: string
  message?: string
  draft: string
  connected: boolean
  onChangeDraft: (draft: string) => void
  onSend: (text: string) => void
  onClose: () => void
}) {
  const copy = localTasksCopy()
  const text = props.draft.trim()
  const canSend = props.connected && text.length > 0
  return (
    <BottomDrawer visible={props.visible} onClose={props.onClose}>
      <View style={styles.header}>
        <Text style={styles.title}>{props.title}</Text>
        {props.message ? <Text style={styles.message}>{props.message}</Text> : null}
      </View>
      <TextInput
        testID="local-task-reply-input"
        style={[styles.input, !props.connected && styles.disabled]}
        value={props.draft}
        onChangeText={props.onChangeDraft}
        editable={props.connected}
        multiline
        autoFocus
        placeholder={props.connected ? copy.work.replyPlaceholder : copy.work.replyReconnecting}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accentBlue}
      />
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          onPress={props.onClose}
          accessibilityRole="button"
        >
          <Text style={styles.cancelText}>{copy.cancel}</Text>
        </Pressable>
        <Pressable
          testID="local-task-reply-send"
          style={({ pressed }) => [
            styles.sendButton,
            pressed && styles.pressed,
            !canSend && styles.disabled
          ]}
          disabled={!canSend}
          onPress={() => props.onSend(text)}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
        >
          <Text style={styles.sendText}>{copy.send}</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xs, paddingBottom: spacing.sm },
  title: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  message: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  input: {
    backgroundColor: colors.bgRaised,
    color: colors.textPrimary,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
    fontSize: TEXT_INPUT_FONT_SIZE,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    minHeight: 72,
    textAlignVertical: 'top'
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  cancelButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.button
  },
  sendButton: {
    backgroundColor: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.button
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  cancelText: {
    color: colors.textSecondary,
    fontSize: typography.bodySize,
    fontWeight: '500'
  },
  sendText: { color: colors.bgBase, fontSize: typography.bodySize, fontWeight: '600' }
})
