import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ListFilter, Search, X } from 'lucide-react-native'
import { LOCAL_TASK_STATUS_CATEGORIES } from '../../../src/shared/local-tasks/local-task-model'
import { BottomDrawer } from '../components/BottomDrawer'
import { colors, radii, spacing } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import {
  EMPTY_LOCAL_TASK_FILTER,
  localTaskFilterCount,
  toggleLocalTaskFilterValue,
  type LocalTaskFilter
} from './local-task-filter'
import { localTaskStyles } from './local-tasks-styles'
import {
  LocalTaskPriorityIcon,
  LocalTaskStatusIcon,
  localTaskCategoryColor
} from './local-tasks-visuals'

// The order the priority picker uses: urgent first, "no priority" last.
const PRIORITY_ORDER = [1, 2, 3, 4, 0] as const

/** Search by ref or title, and a sheet for category, priority and labels. */
export function LocalTasksFilterBar(props: {
  filter: LocalTaskFilter
  labels: string[]
  onChange: (filter: LocalTaskFilter) => void
}) {
  const copy = localTasksCopy()
  const [open, setOpen] = useState(false)
  const { filter } = props
  const count = localTaskFilterCount(filter)
  const set = (patch: Partial<LocalTaskFilter>) => props.onChange({ ...filter, ...patch })
  return (
    <View style={styles.row}>
      <View style={styles.search}>
        <Search size={14} color={colors.textMuted} />
        <TextInput
          style={[localTaskStyles.bareInput, styles.searchInput]}
          value={filter.query}
          onChangeText={(query) => set({ query })}
          placeholder={copy.searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {filter.query ? (
          <Pressable
            onPress={() => set({ query: '' })}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={copy.clearFilters}
          >
            <X size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        style={[styles.filterButton, count > 0 && styles.filterButtonActive]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={copy.filterTitle}
      >
        <ListFilter size={16} color={count > 0 ? colors.textPrimary : colors.textSecondary} />
        {count > 0 ? <Text style={styles.badge}>{count}</Text> : null}
      </Pressable>
      <BottomDrawer visible={open} onClose={() => setOpen(false)} contentScrollable>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{copy.filterTitle}</Text>
          {count > 0 ? (
            <Pressable
              onPress={() => props.onChange({ ...EMPTY_LOCAL_TASK_FILTER, query: filter.query })}
              accessibilityRole="button"
            >
              <Text style={localTaskStyles.sectionActionText}>{copy.clearFilters}</Text>
            </Pressable>
          ) : null}
        </View>
        <FilterSection title={copy.filterCategories}>
          {LOCAL_TASK_STATUS_CATEGORIES.map((category) => (
            <FilterChip
              key={category}
              label={copy.categories[category]}
              icon={
                <LocalTaskStatusIcon
                  category={category}
                  color={localTaskCategoryColor(category)}
                  size={13}
                />
              }
              selected={filter.categories.includes(category)}
              onPress={() =>
                set({ categories: toggleLocalTaskFilterValue(filter.categories, category) })
              }
            />
          ))}
        </FilterSection>
        <FilterSection title={copy.priority}>
          {PRIORITY_ORDER.map((priority) => (
            <FilterChip
              key={priority}
              label={copy.priorities[priority] ?? ''}
              icon={<LocalTaskPriorityIcon priority={priority} />}
              selected={filter.priorities.includes(priority)}
              onPress={() =>
                set({ priorities: toggleLocalTaskFilterValue(filter.priorities, priority) })
              }
            />
          ))}
        </FilterSection>
        <FilterSection title={copy.labels}>
          {props.labels.length === 0 ? (
            <Text style={localTaskStyles.meta}>{copy.noLabels}</Text>
          ) : (
            props.labels.map((label) => (
              <FilterChip
                key={label}
                label={label}
                selected={filter.labels.includes(label)}
                onPress={() => set({ labels: toggleLocalTaskFilterValue(filter.labels, label) })}
              />
            ))
          )}
        </FilterSection>
      </BottomDrawer>
    </View>
  )
}

function FilterSection(props: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={localTaskStyles.meta}>{props.title}</Text>
      <View style={styles.chips}>{props.children}</View>
    </View>
  )
}

function FilterChip(props: {
  label: string
  icon?: ReactNode
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      style={[styles.chip, props.selected && styles.chipSelected]}
      onPress={props.onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.selected }}
      accessibilityLabel={props.label}
    >
      {props.icon}
      <Text style={[localTaskStyles.chipMeta, props.selected && styles.chipTextSelected]}>
        {props.label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.input,
    paddingHorizontal: spacing.sm,
    minHeight: 36
  },
  searchInput: { flex: 1, paddingVertical: 6 },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  filterButtonActive: { borderColor: colors.textSecondary, backgroundColor: colors.bgRaised },
  badge: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm
  },
  sheetTitle: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  section: { gap: spacing.sm, paddingHorizontal: spacing.xs, paddingBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  chipSelected: { borderColor: colors.textSecondary, backgroundColor: colors.bgRaised },
  chipTextSelected: { color: colors.textPrimary, fontWeight: '600' }
})
