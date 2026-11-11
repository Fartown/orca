import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Search, X } from 'lucide-react-native'
import { BottomDrawer } from '../components/bottom-drawer/BottomDrawer'
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
  /** A short fact on the right, e.g. which task already holds it. */
  tag?: string
  /** Consecutive choices with the same section are drawn as one titled group. */
  section?: string
  disabled?: boolean
  onPress: () => void
}

/** Consecutive choices grouped by section, each group keeping its order. */
function choiceGroups(
  choices: readonly LocalTaskChoice[]
): { section: string | undefined; choices: LocalTaskChoice[] }[] {
  const groups: { section: string | undefined; choices: LocalTaskChoice[] }[] = []
  for (const choice of choices) {
    const last = groups.at(-1)
    if (last && last.section === choice.section) {
      last.choices.push(choice)
    } else {
      groups.push({ section: choice.section, choices: [choice] })
    }
  }
  return groups
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
      {choiceGroups(props.choices).map((group, at) => (
        <View key={`${group.section ?? ''}:${at}`} style={styles.section}>
          {group.section ? (
            <Text style={styles.sectionTitle}>
              {group.section} <Text style={styles.sectionCount}>{group.choices.length}</Text>
            </Text>
          ) : null}
          <View style={styles.group}>
            {group.choices.map((choice, index) => (
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
                  <View style={styles.rowText}>
                    <Text style={styles.label} numberOfLines={1}>
                      {choice.label}
                    </Text>
                    {choice.subtitle ? (
                      <Text style={localTaskStyles.meta} numberOfLines={1}>
                        {choice.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {choice.tag ? (
                    <View style={localTaskStyles.label}>
                      <Text style={localTaskStyles.labelText} numberOfLines={1}>
                        {choice.tag}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ))}
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
    borderRadius: radii.control,
    paddingHorizontal: spacing.sm,
    minHeight: 36,
    marginBottom: spacing.sm
  },
  searchInput: { flex: 1, paddingVertical: 6 },
  noMatch: { paddingHorizontal: spacing.xs, paddingBottom: spacing.sm },
  section: { gap: spacing.xs, marginBottom: spacing.sm },
  sectionTitle: {
    paddingHorizontal: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600'
  },
  sectionCount: { color: colors.textMuted, fontWeight: '400' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowPressed: { backgroundColor: colors.bgRaised },
  label: { color: colors.textPrimary, fontSize: typography.bodySize }
})
