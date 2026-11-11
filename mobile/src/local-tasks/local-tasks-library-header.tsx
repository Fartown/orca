import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  ChevronDown,
  ChevronLeft,
  Columns3,
  Layers,
  List,
  Plus,
  Search,
  Server,
  Settings
} from 'lucide-react-native'
import type { LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { ActionSheetModal, type ActionSheetAction } from '../components/ActionSheetModal'
import { colors, typography } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskStyles } from './local-tasks-styles'

export type LocalTasksViewMode = 'list' | 'board'

/**
 * Back, the title, New task and Search, as the prototype's header. The title also names the scope
 * (all projects or one, and the host when several are reachable) and opens the page's switches:
 * project, host, project settings, list or board.
 */
export function LocalTasksLibraryHeader(props: {
  projects: readonly LocalTaskProject[]
  /** Null for all projects. */
  projectId: string | null
  onSelectProject: (projectId: string | null) => void
  onCreateProject?: () => void
  /** Shown only while the page reaches more than one host's library (D-008). */
  hostLabel: string | null
  onPickHost: () => void
  view: LocalTasksViewMode
  /** Off where list and board mean nothing: with no project, and in "Needs you". */
  showViewToggle: boolean
  /** Absent where nothing can be created: a read-only library, or one with no project. */
  onNewTask?: () => void
  /** Absent where there is nothing to search ("Needs you"). */
  onSearch?: () => void
  searchActive: boolean
  onExit: () => void
  onSettings: () => void
  onView: (view: LocalTasksViewMode) => void
}) {
  const copy = localTasksCopy()
  const [menuOpen, setMenuOpen] = useState(false)
  const project = props.projects.find((entry) => entry.id === props.projectId) ?? null
  const hasProjects = props.projects.length > 0
  // Why not only with projects: an empty library still needs the way to another host's library.
  const canOpen = hasProjects || props.hostLabel !== null || props.onCreateProject !== undefined
  const scope = [
    project ? `${project.name} · ${project.prefix}` : copy.allProjects,
    props.hostLabel
  ]
    .filter(Boolean)
    .join(' · ')
  const actions: ActionSheetAction[] = [
    ...(hasProjects
      ? [
          {
            label: copy.allProjects,
            icon: Layers,
            checked: props.projectId === null,
            onPress: () => props.onSelectProject(null)
          }
        ]
      : []),
    ...props.projects.map((entry) => ({
      label: entry.name,
      hint: entry.prefix,
      checked: entry.id === props.projectId,
      onPress: () => props.onSelectProject(entry.id)
    })),
    ...(props.onCreateProject
      ? [
          {
            label: copy.createProject,
            icon: Plus,
            closeBeforePress: true,
            onPress: props.onCreateProject
          }
        ]
      : []),
    ...(props.hostLabel !== null
      ? [
          {
            label: copy.switchHost,
            hint: props.hostLabel,
            icon: Server,
            closeBeforePress: true,
            onPress: props.onPickHost
          }
        ]
      : []),
    ...(props.showViewToggle
      ? (['list', 'board'] as const).map((mode) => ({
          label: mode === 'list' ? copy.viewList : copy.viewBoard,
          icon: mode === 'list' ? List : Columns3,
          checked: props.view === mode,
          onPress: () => props.onView(mode)
        }))
      : []),
    {
      label: copy.projectSettings,
      icon: Settings,
      closeBeforePress: true,
      onPress: props.onSettings
    }
  ]
  return (
    <View style={localTaskStyles.topBar}>
      <Pressable
        style={[localTaskStyles.backButton, styles.side]}
        onPress={props.onExit}
        accessibilityRole="button"
      >
        <ChevronLeft size={22} color={colors.textPrimary} />
        <Text style={localTaskStyles.backLabel}>{copy.back}</Text>
      </Pressable>
      <Pressable
        style={styles.title}
        disabled={!canOpen}
        onPress={() => setMenuOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={copy.switchProject}
        testID="local-tasks-scope"
      >
        <Text style={styles.titleText} numberOfLines={1}>
          {copy.title}
        </Text>
        {canOpen ? (
          <View style={styles.scope}>
            <Text style={styles.scopeText} numberOfLines={1}>
              {hasProjects ? scope : (props.hostLabel ?? copy.createProject)}
            </Text>
            <ChevronDown size={11} color={colors.textMuted} />
          </View>
        ) : null}
      </Pressable>
      <View style={[styles.side, styles.trailing]}>
        {props.onNewTask ? (
          <Pressable
            style={localTaskStyles.iconButton}
            onPress={props.onNewTask}
            accessibilityRole="button"
            accessibilityLabel={copy.newTask}
            testID="local-tasks-new-task"
          >
            <Plus size={20} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        {props.onSearch ? (
          <Pressable
            style={[
              localTaskStyles.iconButton,
              props.searchActive && localTaskStyles.iconButtonActive
            ]}
            onPress={props.onSearch}
            accessibilityRole="button"
            accessibilityState={{ expanded: props.searchActive }}
            accessibilityLabel={copy.searchPlaceholder}
          >
            <Search size={19} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
      <ActionSheetModal
        visible={menuOpen}
        title={copy.switchProject}
        actions={actions}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // Equal sides keep the title centered whichever buttons show.
  side: { width: 92 },
  trailing: { flexDirection: 'row', justifyContent: 'flex-end', gap: 2 },
  title: { flex: 1, minWidth: 0, alignItems: 'center' },
  titleText: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  scope: { flexDirection: 'row', alignItems: 'center', gap: 2, maxWidth: '100%' },
  scopeText: { flexShrink: 1, color: colors.textMuted, fontSize: typography.metaSize }
})
