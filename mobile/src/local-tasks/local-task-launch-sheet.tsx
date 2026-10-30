import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Bot, ChevronRight, FolderPlus, MapPin, Send } from 'lucide-react-native'
import { ActionSheetContent, type ActionSheetAction } from '../components/ActionSheetModal'
import { BottomDrawer } from '../components/BottomDrawer'
import { MobileSwitch } from '../components/MobileSwitch'
import { PickerModal } from '../components/PickerModal'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import type { LocalTaskSetup } from './local-task-project-setups'
import type { LocalTaskLaunchController } from './use-local-task-launch'

/** The host a launch runs on, as the user knows it. */
export function localTaskHostLabel(hostId: string, label: string | null | undefined): string {
  return label?.trim() || (hostId === 'local' ? localTasksCopy().work.hostLocal : hostId)
}

/** A checkout as Start lists it: its repo, and the host it runs on. */
export function localTaskSetupLabel(
  setup: Pick<LocalTaskSetup, 'hostId' | 'label'>,
  hostLabels: ReadonlyMap<string, string>
): string {
  return [setup.label, localTaskHostLabel(setup.hostId, hostLabels.get(setup.hostId))]
    .filter(Boolean)
    .join(' · ')
}

/** The sheet, or the repo-and-host picker, or one of them closing so the other can present. */
type Phase = 'sheet' | 'to-picker' | 'picker' | 'to-sheet'

/**
 * Start and Open-a-session ask the same three things: where (Start only: which of the project's
 * repos, on which host) and how the prompt arrives, as settings on top, then which agent, which is
 * the commit. The picker opens only once the sheet has closed: iOS presents one Modal at a time.
 */
export function LocalTaskLaunchSheet(props: {
  launch: LocalTaskLaunchController
  hostLabels: ReadonlyMap<string, string>
  /** The linked workspace's host as the caller names it, for Open a session. */
  workspaceHostLabel: string
}) {
  const work = localTasksCopy().work
  const { launch } = props
  const request = launch.request
  const [phase, setPhase] = useState<Phase>('sheet')
  // Why during render: a closed request must not leave the next one opening on the picker.
  const [lastRequest, setLastRequest] = useState(request)
  if (lastRequest !== request) {
    setLastRequest(request)
    if (!request) {
      setPhase('sheet')
    }
  }
  const hostLabel = request
    ? request.mode === 'start'
      ? localTaskSetupLabel(request.setup, props.hostLabels)
      : props.workspaceHostLabel
    : ''
  const canChangeLocation =
    request?.mode === 'start' && request.setups.filter((setup) => setup.kind === 'git').length > 1
  const actions: ActionSheetAction[] = []
  if (launch.agents.status === 'loading') {
    actions.push({ label: work.loadingAgents, loading: true, disabled: true, onPress: () => {} })
  } else {
    for (const option of launch.agents.status === 'ready' ? launch.agents.agents : []) {
      actions.push({
        label: option.label,
        icon: Bot,
        onPress: () => void launch.launch(option.agent, hostLabel)
      })
    }
    if (
      request?.mode !== 'start' &&
      (launch.agents.status === 'failed' || launch.agents.agents.length === 0)
    ) {
      actions.push({ label: work.noAgents, disabled: true, onPress: () => {} })
    }
  }
  if (request?.mode === 'start') {
    actions.push({
      label: work.workspaceOnly,
      hint: work.workspaceOnlyHint,
      icon: FolderPlus,
      onPress: () => void launch.launch(null, hostLabel)
    })
  }
  return (
    <>
      <BottomDrawer
        visible={request !== null && phase === 'sheet'}
        onClose={launch.close}
        onAfterClose={() => setPhase((current) => (current === 'to-picker' ? 'picker' : current))}
        dragContentToDismiss
      >
        <ActionSheetContent
          title={
            request
              ? request.mode === 'start'
                ? work.startTitle(request.sessionTask.title)
                : work.openSessionTitle(request.sessionTask.title)
              : undefined
          }
          message={request?.mode === 'start' ? work.startWhere(request.name, hostLabel) : undefined}
          actions={actions}
          onClose={launch.close}
        >
          <View style={styles.settings}>
            {canChangeLocation ? (
              <>
                <Pressable
                  style={({ pressed }) => [styles.setting, pressed && styles.settingPressed]}
                  onPress={() => setPhase('to-picker')}
                  accessibilityRole="button"
                >
                  <MapPin size={16} color={colors.textSecondary} />
                  <View style={styles.settingText}>
                    <Text style={styles.settingLabel}>{work.changeLocation}</Text>
                    <Text style={styles.settingHint} numberOfLines={1}>
                      {hostLabel}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textMuted} />
                </Pressable>
                <View style={styles.separator} />
              </>
            ) : null}
            <View style={styles.setting}>
              <Send size={16} color={colors.textSecondary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{work.sendNow}</Text>
                <Text style={styles.settingHint}>
                  {launch.delivery === 'submit' ? work.sendNowOnHint : work.sendNowOffHint}
                </Text>
              </View>
              <MobileSwitch
                value={launch.delivery === 'submit'}
                onValueChange={() => launch.toggleDelivery()}
                accessibilityLabel={work.sendNow}
              />
            </View>
          </View>
        </ActionSheetContent>
      </BottomDrawer>
      <PickerModal
        visible={phase === 'picker' && request?.mode === 'start'}
        title={work.pickLocation}
        options={
          request?.mode === 'start'
            ? request.setups
                .filter((setup) => setup.kind === 'git')
                .map((setup) => ({
                  value: `${setup.hostId}\u0000${setup.repoId}`,
                  label: localTaskSetupLabel(setup, props.hostLabels)
                }))
            : []
        }
        selected={
          request?.mode === 'start' ? `${request.setup.hostId}\u0000${request.setup.repoId}` : ''
        }
        onSelect={(value) => {
          const setup =
            request?.mode === 'start'
              ? request.setups.find((entry) => `${entry.hostId}\u0000${entry.repoId}` === value)
              : undefined
          if (setup) {
            void launch.chooseSetup(setup, localTaskSetupLabel(setup, props.hostLabels))
          }
        }}
        onClose={() => setPhase('to-sheet')}
        // Back to the sheet only once the picker's Modal is gone, whichever way it closed.
        onAfterClose={() => setPhase('sheet')}
      />
    </>
  )
}

const styles = StyleSheet.create({
  // Drawn like ActionSheetContent's group, so the settings and the agents read as one sheet.
  settings: {
    backgroundColor: colors.bgPanel,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.sm
  },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2
  },
  settingPressed: { backgroundColor: colors.bgRaised },
  settingText: { flex: 1, minWidth: 0 },
  settingLabel: { fontSize: typography.bodySize, fontWeight: '500', color: colors.textPrimary },
  settingHint: { marginTop: 2, fontSize: typography.metaSize, color: colors.textMuted },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: spacing.md
  }
})
