import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Folder, GitBranch, Info, Laptop, Search, Server } from 'lucide-react-native'
import { MobileSegmentedControl } from '../components/MobileSegmentedControl'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import type { LocalTaskCreateWorkspaceChoice } from './local-task-create-choices'
import { localTaskCreateCopy } from './local-task-create-copy'
import { localTaskReviewLabel } from './local-task-workspace-review-line'
import { localTaskStyles } from './local-tasks-styles'
import type { LocalTaskCreateWhereState } from './use-local-task-create-where'

// Why a cap: the step sits above 开工 in one scroll; search or "Show all" reaches the rest.
const ROWS_SHOWN = 10

export function LocalTaskCreateStepHeading(props: { step: number; title: string }) {
  return (
    <View style={styles.stepHeading} accessibilityRole="header">
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{props.step}</Text>
      </View>
      <Text style={styles.stepTitle}>{props.title}</Text>
    </View>
  )
}

export function LocalTaskCreateNote(props: { children: ReactNode; warn?: boolean }) {
  return (
    <View style={styles.note}>
      <Info size={14} color={props.warn ? colors.statusAmber : colors.textMuted} />
      <Text style={[localTaskStyles.hint, styles.noteText]}>{props.children}</Text>
    </View>
  )
}

export function LocalTaskCreateRadio(props: { on: boolean }) {
  return (
    <View style={[styles.radio, props.on && styles.radioOn]}>
      {props.on ? <View style={styles.radioDot} /> : null}
    </View>
  )
}

function choiceLine(choice: LocalTaskCreateWorkspaceChoice, hostName: string): string {
  const create = localTaskCreateCopy()
  const work = localTasksCopy().work
  if (choice.block === 'host-offline') {
    return create.hostNotConnected(hostName)
  }
  if (choice.owner) {
    return create.ownedSubtask(choice.owner.ref)
  }
  if (choice.block === 'no-project') {
    return create.noProjectHere
  }
  if (choice.review) {
    const { checks } = choice.review
    return [
      localTaskReviewLabel(choice.review, true),
      checks && checks !== 'neutral' ? work.checks[checks] : null
    ]
      .filter(Boolean)
      .join(' · ')
  }
  if (choice.main) {
    return create.mainWorkspace
  }
  return choice.folder ? create.folderWorkspace : create.free
}

function WorkspaceRow(props: {
  choice: LocalTaskCreateWorkspaceChoice
  picked: boolean
  hostName: string
  onPick: () => void
}) {
  const { choice } = props
  const blocked = choice.block !== null
  return (
    <Pressable
      style={({ pressed }) => [
        localTaskStyles.cardRow,
        styles.choiceRow,
        props.picked && styles.picked,
        pressed && !blocked && localTaskStyles.pressed,
        blocked && localTaskStyles.disabled
      ]}
      disabled={blocked}
      onPress={props.onPick}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.picked, disabled: blocked }}
    >
      <LocalTaskCreateRadio on={props.picked} />
      <View style={styles.rowText}>
        <Text style={localTaskStyles.rowValue} numberOfLines={1}>
          {choice.candidate.displayName}
        </Text>
        <Text
          style={[localTaskStyles.meta, choice.block === 'host-offline' && styles.warn]}
          numberOfLines={1}
        >
          {choiceLine(choice, props.hostName)}
        </Text>
      </View>
    </Pressable>
  )
}

function ExistingWorkspaces({ state }: { state: LocalTaskCreateWhereState }) {
  const create = localTaskCreateCopy()
  const [showAll, setShowAll] = useState(false)
  const total = state.groups.reduce((sum, group) => sum + group.choices.length, 0)
  let budget = showAll ? total : ROWS_SHOWN
  let body: ReactNode
  if (state.workspaces === 'loading') {
    body = (
      <View style={styles.status}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={localTaskStyles.meta}>{create.loadingWorkspaces}</Text>
      </View>
    )
  } else if (state.workspaces === 'failed') {
    body = <Text style={[localTaskStyles.meta, styles.status]}>{create.workspacesUnread}</Text>
  } else if (state.groups.length === 0) {
    body = (
      <Text style={[localTaskStyles.meta, styles.status]}>
        {state.hasWorkspaces ? create.noMatches : create.noWorkspaces}
      </Text>
    )
  } else {
    body = state.groups.map((group, index) => {
      // The picked row stays shown, whatever the cap leaves out.
      const rows = group.choices.filter((choice) => {
        if (budget > 0 || choice.key === state.picked?.key) {
          budget -= 1
          return true
        }
        return false
      })
      if (rows.length === 0) {
        return null
      }
      const hostName = state.hosts.name(group.ownerHostId)
      const HostIcon = group.ownerHostId === 'local' ? Laptop : Server
      return (
        <View key={group.key}>
          <View style={[styles.groupHead, index === 0 && localTaskStyles.cardRowFirst]}>
            <HostIcon size={12} color={colors.textMuted} />
            <Text style={styles.groupText} numberOfLines={1}>
              {[group.repoLabel, hostName].filter(Boolean).join(' · ')}
            </Text>
            {group.offline ? (
              <Text style={[localTaskStyles.meta, styles.warn]}>{create.notConnected}</Text>
            ) : null}
          </View>
          {rows.map((choice) => (
            <WorkspaceRow
              key={choice.key}
              choice={choice}
              picked={choice.key === state.picked?.key}
              hostName={hostName}
              onPick={() => state.pickWorkspace(choice)}
            />
          ))}
        </View>
      )
    })
  }
  return (
    <>
      <View style={[localTaskStyles.input, styles.search]}>
        <Search size={14} color={colors.textMuted} />
        <TextInput
          style={[localTaskStyles.bareInput, styles.searchInput]}
          value={state.query}
          onChangeText={state.setQuery}
          placeholder={create.searchWorkspaces}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={create.searchWorkspaces}
        />
      </View>
      <View style={localTaskStyles.card}>
        {body}
        {!showAll && total > ROWS_SHOWN && state.workspaces === 'ready' ? (
          <Pressable
            style={({ pressed }) => [localTaskStyles.cardRow, pressed && localTaskStyles.pressed]}
            onPress={() => setShowAll(true)}
            accessibilityRole="button"
          >
            <Text style={localTaskStyles.sectionActionText}>{create.showAll(total)}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  )
}

function NewWorkspace({ state }: { state: LocalTaskCreateWhereState }) {
  const create = localTaskCreateCopy()
  const { repo } = state
  const repoHost = repo ? state.hosts.name(repo.setup.ownerHostId) : ''
  const offlineHosts = [
    ...new Set(
      state.repos
        .filter((choice) => choice.block === 'host-offline')
        .map((choice) => state.hosts.name(choice.setup.ownerHostId))
        .filter(Boolean)
    )
  ]
  let chips: ReactNode
  if (state.catalog === 'loading') {
    chips = (
      <>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={localTaskStyles.meta}>{create.loadingRepos}</Text>
      </>
    )
  } else if (state.catalog === 'unavailable') {
    chips = <Text style={localTaskStyles.meta}>{create.catalogUnavailable}</Text>
  } else if (state.repos.length === 0) {
    chips = <Text style={localTaskStyles.meta}>{create.noRepos}</Text>
  } else {
    chips = state.repos.map((choice) => {
      const host = state.hosts.name(choice.setup.ownerHostId)
      const on = choice.key === repo?.key
      const offline = choice.block === 'host-offline'
      return (
        <Pressable
          key={choice.key}
          style={[
            localTaskStyles.chip,
            styles.repoChip,
            on && styles.chipOn,
            choice.block !== null && localTaskStyles.disabled
          ]}
          disabled={choice.block !== null}
          onPress={() => state.pickRepo(choice)}
          accessibilityRole="radio"
          accessibilityState={{ checked: on, disabled: choice.block !== null }}
        >
          <Folder size={12} color={colors.textSecondary} />
          <Text style={localTaskStyles.chipText} numberOfLines={1}>
            {[choice.setup.label, offline ? create.hostNotConnected(host) : host]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Pressable>
      )
    })
  }
  return (
    <>
      <View style={localTaskStyles.card}>
        <View style={[localTaskStyles.cardRow, localTaskStyles.cardRowFirst, styles.top]}>
          <Text style={localTaskStyles.rowLabel}>{create.repo}</Text>
          <View style={styles.chips}>{chips}</View>
        </View>
        <View style={localTaskStyles.cardRow}>
          <Text style={localTaskStyles.rowLabel}>{create.name}</Text>
          <TextInput
            style={[localTaskStyles.bareInput, styles.mono, styles.flex]}
            value={state.workspaceName}
            onChangeText={state.setWorkspaceName}
            placeholder={create.nameAuto}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={create.name}
          />
        </View>
        <View style={localTaskStyles.cardRow}>
          <Text style={localTaskStyles.rowLabel}>{create.base}</Text>
          <GitBranch size={14} color={colors.textMuted} />
          <Text style={[localTaskStyles.rowValue, styles.flex]} numberOfLines={1}>
            {create.baseDefault}
          </Text>
          {repo ? (
            <Text style={localTaskStyles.meta} numberOfLines={1}>
              {create.repoOnHost(repo.setup.label, repoHost)}
            </Text>
          ) : null}
        </View>
      </View>
      {repo ? <LocalTaskCreateNote>{create.newNote(repoHost)}</LocalTaskCreateNote> : null}
      {offlineHosts.length > 0 ? (
        <LocalTaskCreateNote warn>
          {create.offlineReposNote(offlineHosts.join(', '))}
        </LocalTaskCreateNote>
      ) : null}
    </>
  )
}

/** ② 在哪做 (m8): an existing workspace, a new one from a repository, or decide later. */
export function LocalTaskCreateWhereSection({ state }: { state: LocalTaskCreateWhereState }) {
  const create = localTaskCreateCopy()
  return (
    <View style={styles.section}>
      <LocalTaskCreateStepHeading step={2} title={create.stepWhere} />
      {state.unavailable ? (
        <LocalTaskCreateNote warn>{state.unavailable}</LocalTaskCreateNote>
      ) : null}
      <MobileSegmentedControl
        segments={[
          { value: 'existing', label: create.whereExisting },
          { value: 'new', label: create.whereNew },
          { value: 'later', label: create.whereLater }
        ]}
        selected={state.where}
        onSelect={state.changeWhere}
        disabled={state.unavailable !== null}
        fill
        tabs
        testIDPrefix="local-task-create-where-"
      />
      {state.where === 'existing' ? <ExistingWorkspaces state={state} /> : null}
      {state.where === 'new' ? <NewWorkspace state={state} /> : null}
      {state.where === 'later' && !state.unavailable ? (
        <View style={[localTaskStyles.notice, styles.laterNote]}>
          <Text style={localTaskStyles.noticeText}>{create.laterNote}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.lg },
  stepHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepNumberText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  stepTitle: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  noteText: { flex: 1 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioOn: { borderColor: colors.textPrimary },
  radioDot: { width: 8, height: 8, borderRadius: radii.pill, backgroundColor: colors.textPrimary },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchInput: { flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  groupText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600'
  },
  warn: { color: colors.statusAmber },
  choiceRow: { gap: spacing.md },
  picked: { backgroundColor: colors.bgRaised },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  top: { alignItems: 'flex-start' },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  repoChip: { maxWidth: '100%' },
  chipOn: { borderColor: colors.textSecondary, backgroundColor: colors.bgRaised },
  mono: { fontFamily: typography.monoFamily },
  flex: { flex: 1 },
  laterNote: { marginHorizontal: 0, marginBottom: 0 }
})
