import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { AtSign, Laptop, Send, X } from 'lucide-react-native'
import { TEXT_INPUT_FONT_SIZE } from '../platform/text-input-font-size'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskStyles } from './local-tasks-styles'

export type LocalTaskDispatchChip = { key: string; label: string; clear: () => void }

/**
 * The dispatch box: what @ picked as chips, the sentence, @ and send; under it which host runs the
 * work, and what sending will do.
 */
export function LocalTaskDispatchComposer(props: {
  text: string
  onChangeText: (text: string) => void
  chips: readonly LocalTaskDispatchChip[]
  sendDisabled: boolean
  onSend: () => void
  /** The library's host as the user knows it. */
  hostLabel: string
  onSendLine: string | null
  hint: string | null
  error: string | null
}) {
  const copy = localTasksCopy()
  const dispatch = copy.work.dispatch
  return (
    <View style={styles.container}>
      <View style={styles.composer}>
        {props.chips.length > 0 ? (
          <View style={styles.chips}>
            {props.chips.map((chip) => (
              <Pressable
                key={chip.key}
                style={styles.chip}
                onPress={chip.clear}
                accessibilityRole="button"
                accessibilityLabel={`${dispatch.clearTarget}: ${chip.label}`}
                testID={`local-task-dispatch-chip-${chip.key}`}
              >
                <Text style={styles.chipText} numberOfLines={1}>
                  {chip.label}
                </Text>
                <X size={12} color={colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        ) : null}
        <TextInput
          style={styles.input}
          value={props.text}
          onChangeText={props.onChangeText}
          multiline
          placeholder={dispatch.placeholder}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={copy.dispatchPlaceholder}
        />
        <View style={styles.toolbar}>
          <Pressable
            style={styles.tool}
            onPress={() =>
              props.onChangeText(/(^|\s)$/.test(props.text) ? `${props.text}@` : `${props.text} @`)
            }
            accessibilityRole="button"
            accessibilityLabel={dispatch.mention}
          >
            <AtSign size={17} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.spacer} />
          <Pressable
            style={[styles.send, props.sendDisabled && localTaskStyles.disabled]}
            disabled={props.sendDisabled}
            onPress={props.onSend}
            accessibilityRole="button"
            accessibilityLabel={copy.dispatchButton}
          >
            <Send size={16} color={colors.bgBase} />
          </Pressable>
        </View>
      </View>
      <View style={styles.execLine}>
        <Laptop size={12} color={colors.textMuted} />
        <Text style={[localTaskStyles.meta, styles.shrink]} numberOfLines={2}>
          {dispatch.runBy(props.hostLabel)}
        </Text>
      </View>
      {props.onSendLine ? <Text style={localTaskStyles.meta}>{props.onSendLine}</Text> : null}
      {props.hint ? <Text style={localTaskStyles.hint}>{props.hint}</Text> : null}
      {props.error ? <Text style={localTaskStyles.errorText}>{props.error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs },
  composer: {
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.skillTokenSurface
  },
  chipText: { flexShrink: 1, color: colors.skillToken, fontSize: typography.metaSize },
  input: {
    minHeight: 44,
    maxHeight: 120,
    paddingVertical: spacing.xs,
    color: colors.textPrimary,
    fontSize: TEXT_INPUT_FONT_SIZE
  },
  toolbar: { flexDirection: 'row', alignItems: 'center' },
  tool: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center'
  },
  spacer: { flex: 1 },
  send: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  execLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  shrink: { flexShrink: 1 }
})
