import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Search, X } from 'lucide-react-native'
import { BottomDrawer } from '../components/BottomDrawer'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskStyles } from './local-tasks-styles'

/** A search box over the choices; the caller filters, so a task list matches by title or ref. */
export type LocalTaskChoiceSearch = {
  query: string
  placeholder: string
  onChange: (query: string) => void
}

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
  search?: LocalTaskChoiceSearch | null
  onClose: () => void
}) {
  const { search } = props
  return (
    <BottomDrawer visible={props.visible} onClose={props.onClose} contentScrollable>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {props.title}
        </Text>
        {props.message ? <Text style={localTaskStyles.hint}>{props.message}</Text> : null}
        {props.error ? <Text style={localTaskStyles.errorText}>{props.error}</Text> : null}
      </View>
      {search ? (
        <View style={styles.search}>
          <Search size={14} color={colors.textMuted} />
          <TextInput
            testID="local-task-choice-search"
            style={[localTaskStyles.bareInput, styles.searchInput]}
            value={search.query}
            onChangeText={search.onChange}
            placeholder={search.placeholder}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.query ? (
            <Pressable
              onPress={() => search.onChange('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={localTasksCopy().clearFilters}
            >
              <X size={14} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {search?.query && props.choices.length === 0 ? (
        <Text style={[localTaskStyles.hint, styles.noMatch]}>{localTasksCopy().filteredEmpty}</Text>
      ) : null}
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
  // Drawn like the task list's search box (local-tasks-filter-bar.tsx).
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.input,
    paddingHorizontal: spacing.sm,
    minHeight: 36,
    marginBottom: spacing.sm
  },
  searchInput: { flex: 1, paddingVertical: 6 },
  noMatch: { paddingHorizontal: spacing.xs, paddingBottom: spacing.sm },
  row: { paddingVertical: spacing.md, paddingHorizontal: spacing.md + 2, gap: 2 },
  rowPressed: { backgroundColor: colors.bgRaised },
  label: { color: colors.textPrimary, fontSize: typography.bodySize }
})
