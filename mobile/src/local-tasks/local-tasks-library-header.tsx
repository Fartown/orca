import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronDown, ChevronLeft, Columns3, Layers, List, Settings } from 'lucide-react-native'
import type { LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { colors } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskStyles } from './local-tasks-styles'

export type LocalTasksViewMode = 'list' | 'board'

/** Back, settings and the list/board toggle, then the title with the project switch. */
export function LocalTasksLibraryHeader(props: {
  project: LocalTaskProject | null
  hasProjects: boolean
  view: LocalTasksViewMode
  onExit: () => void
  onSettings: () => void
  onView: (view: LocalTasksViewMode) => void
  onPickProject: () => void
}) {
  const copy = localTasksCopy()
  return (
    <>
      <View style={localTaskStyles.topBar}>
        <Pressable
          style={localTaskStyles.backButton}
          onPress={props.onExit}
          accessibilityRole="button"
        >
          <ChevronLeft size={22} color={colors.textPrimary} />
          <Text style={localTaskStyles.backLabel}>{copy.back}</Text>
        </Pressable>
        <View style={localTaskStyles.topBarSpacer} />
        <Pressable
          style={localTaskStyles.iconButton}
          onPress={props.onSettings}
          accessibilityRole="button"
          accessibilityLabel={copy.projectSettings}
        >
          <Settings size={18} color={colors.textSecondary} />
        </Pressable>
        <View style={styles.viewToggle}>
          {(['list', 'board'] as const).map((mode) => {
            const Icon = mode === 'list' ? List : Columns3
            const active = props.view === mode
            return (
              <Pressable
                key={mode}
                style={[localTaskStyles.iconButton, active && localTaskStyles.iconButtonActive]}
                onPress={() => props.onView(mode)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={mode === 'list' ? copy.viewList : copy.viewBoard}
              >
                <Icon size={17} color={active ? colors.textPrimary : colors.textMuted} />
              </Pressable>
            )
          })}
        </View>
      </View>
      <View style={localTaskStyles.titleRow}>
        <Text style={localTaskStyles.heading}>{copy.title}</Text>
        {props.hasProjects ? (
          <Pressable
            style={localTaskStyles.chip}
            onPress={props.onPickProject}
            accessibilityRole="button"
            accessibilityLabel={copy.switchProject}
          >
            <Layers size={14} color={colors.textSecondary} />
            <Text style={localTaskStyles.chipText} numberOfLines={1}>
              {props.project?.name ?? copy.allProjects}
            </Text>
            {props.project ? (
              <Text style={localTaskStyles.chipMeta}>{props.project.prefix}</Text>
            ) : null}
            <ChevronDown size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.bgPanel,
    borderRadius: 8,
    padding: 2
  }
})
