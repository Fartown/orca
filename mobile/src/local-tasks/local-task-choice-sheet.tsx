import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { BottomDrawer } from '../components/BottomDrawer'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { localTaskStyles } from './local-tasks-styles'

export type LocalTaskChoice = {
  key: string
  label: string
  /** Why a choice is greyed out, or what it adds. */
  subtitle?: string
  disabled?: boolean
  onPress: () => void
}

/**
 * A list to pick one thing from, which stays open to say why a pick failed. PickerModal closes on
 * select, and a refused link has to be read where it was made. Drawn like the app's other sheets:
 * a muted title, then the choices in one rounded group with hairline separators.
 */
export function LocalTaskChoiceSheet(props: {
  visible: boolean
  title: string
  choices: LocalTaskChoice[]
  loading?: boolean
  /** Shown above the list: an empty state, or the last failure. */
  message?: string | null
  error?: string | null
  onClose: () => void
}) {
  return (
    <BottomDrawer visible={props.visible} onClose={props.onClose} contentScrollable>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {props.title}
        </Text>
        {props.message ? <Text style={localTaskStyles.hint}>{props.message}</Text> : null}
        {props.error ? <Text style={localTaskStyles.errorText}>{props.error}</Text> : null}
      </View>
      {props.loading ? <ActivityIndicator color={colors.textSecondary} /> : null}
      {props.choices.length > 0 ? (
        <View style={styles.group}>
          {props.choices.map((choice, index) => (
            <View key={choice.key}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <Pressable
                testID={`local-task-choice-${choice.key}`}
                style={({ pressed }) => [
                  styles.row,
                  pressed && !choice.disabled && styles.rowPressed,
                  choice.disabled && localTaskStyles.disabled
                ]}
                disabled={choice.disabled}
                accessibilityRole="button"
                accessibilityState={{ disabled: choice.disabled === true }}
                onPress={choice.onPress}
              >
                <Text style={styles.label} numberOfLines={1}>
                  {choice.label}
                </Text>
                {choice.subtitle ? (
                  <Text style={localTaskStyles.meta} numberOfLines={1}>
                    {choice.subtitle}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </BottomDrawer>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xs, paddingBottom: spacing.sm, gap: 4 },
  title: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  group: { backgroundColor: colors.bgPanel, borderRadius: 12, overflow: 'hidden' },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: spacing.md
  },
  row: { paddingVertical: spacing.md, paddingHorizontal: spacing.md + 2, gap: 2 },
  rowPressed: { backgroundColor: colors.bgRaised },
  label: { color: colors.textPrimary, fontSize: typography.bodySize }
})
