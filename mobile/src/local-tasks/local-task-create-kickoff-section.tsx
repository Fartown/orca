import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Bot, ChevronRight, Send, X } from 'lucide-react-native'
import type { LocalTaskCreatePlan } from '../../../src/shared/local-tasks/local-task-create-plan'
import { PickerModal } from '../components/PickerModal'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskCreateCopy, type LocalTaskCreateCopy } from './local-task-create-copy'
import {
  LocalTaskCreateNote,
  LocalTaskCreateRadio,
  LocalTaskCreateStepHeading
} from './local-task-create-where-section'
import { localTaskStyles } from './local-tasks-styles'
import type { LocalTaskCreateWhereState } from './use-local-task-create-where'

// Why two: the tiles share one row with 先不开; the rest stay one tap away under Other agents.
const AGENTS_SHOWN = 2

/** The line above the primary button: what pressing it will do, where. */
export function localTaskCreatePlanLine(plan: LocalTaskCreatePlan, create: LocalTaskCreateCopy) {
  switch (plan.kind) {
    case 'later':
      return create.planLater
    case 'pick-workspace':
      return create.planPickWorkspace
    case 'pick-repo':
      return create.planPickRepo
    case 'finding-agents':
      return create.planFindingAgents
    case 'existing': {
      const place = create.workspaceOnHost(plan.workspace, plan.host)
      const line = plan.agent
        ? create.planExistingSession(place, plan.agent)
        : create.planExistingLink(place)
      return plan.parentRef ? create.planAsSubtask(plan.parentRef, line) : line
    }
    case 'new': {
      const name = plan.workspace || create.autoName
      return plan.agent
        ? create.planNewSession(name, plan.host, plan.agent)
        : create.planNewOnly(name, plan.host)
    }
  }
}

function agentsStatus(state: LocalTaskCreateWhereState): string | null {
  const create = localTaskCreateCopy()
  const work = localTasksCopy().work
  const { agents } = state
  if (state.where === 'later') {
    return null
  }
  switch (agents.status) {
    case 'idle':
      return create.agentsAfterWhere
    case 'loading':
      return work.loadingAgents
    case 'ready':
      return agents.agents.length === 0 ? work.noAgents : null
    case 'failed':
      return agents.reason === 'offline'
        ? work.agentsHostOffline(state.targetHostName)
        : agents.reason === 'unverifiable'
          ? work.hostUnknown
          : create.agentsUnreadable
  }
}

function Tile(props: {
  on: boolean
  disabled: boolean
  icon: 'bot' | 'none'
  title: string
  hint: string | null
  onPress: () => void
}) {
  const Icon = props.icon === 'bot' ? Bot : X
  return (
    <Pressable
      // Why no dimming here: a disabled tile only sits in a section that is dimmed as a whole.
      style={({ pressed }) => [
        styles.tile,
        props.on && styles.tileOn,
        pressed && localTaskStyles.pressed
      ]}
      disabled={props.disabled}
      onPress={props.onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.on, disabled: props.disabled }}
    >
      <View style={styles.tileHead}>
        <Icon size={14} color={colors.textPrimary} />
        <Text style={styles.tileTitle} numberOfLines={1}>
          {props.title}
        </Text>
        <LocalTaskCreateRadio on={props.on} />
      </View>
      {props.hint ? (
        <Text style={localTaskStyles.meta} numberOfLines={2}>
          {props.hint}
        </Text>
      ) : null}
    </Pressable>
  )
}

/** ③ 开工 (m8): which agent opens a session there, its first prompt, and how it is sent. */
export function LocalTaskCreateKickoffSection({ state }: { state: LocalTaskCreateWhereState }) {
  const create = localTaskCreateCopy()
  const [moreOpen, setMoreOpen] = useState(false)
  const off = state.where === 'later'
  const options = state.agents.status === 'ready' ? state.agents.agents : []
  const shown = options.slice(0, AGENTS_SHOWN)
  const picked = options.find((option) => option.agent === state.agent)
  if (picked && !shown.includes(picked)) {
    shown[shown.length - 1] = picked
  }
  const status = agentsStatus(state)
  return (
    <View style={[styles.section, off && localTaskStyles.disabled]}>
      <LocalTaskCreateStepHeading step={3} title={create.stepKickoff} />
      <View style={styles.tiles}>
        {shown.map((option) => (
          <Tile
            key={option.agent}
            on={!off && state.agent === option.agent}
            disabled={off}
            icon="bot"
            title={option.label}
            hint={option.agent === options[0]?.agent ? create.defaultAgent : null}
            onPress={() => state.setAgentChoice(option.agent)}
          />
        ))}
        <Tile
          on={!off && state.agentChoice === 'none'}
          disabled={off}
          icon="none"
          title={create.notNow}
          hint={create.notNowHint}
          onPress={() => state.setAgentChoice('none')}
        />
      </View>
      {status ? (
        <View style={styles.status}>
          {state.agents.status === 'loading' && !off ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : null}
          <Text style={[localTaskStyles.meta, styles.flex]}>{status}</Text>
        </View>
      ) : null}
      {options.length > AGENTS_SHOWN && !off ? (
        <Pressable
          style={({ pressed }) => [styles.more, pressed && localTaskStyles.pressed]}
          onPress={() => setMoreOpen(true)}
          accessibilityRole="button"
        >
          <Text style={localTaskStyles.sectionActionText}>{create.moreAgents}</Text>
          <ChevronRight size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}
      <Text style={styles.label}>{create.firstLine}</Text>
      <TextInput
        style={[localTaskStyles.input, (off || state.agent === null) && localTaskStyles.disabled]}
        value={state.firstLine}
        onChangeText={state.setFirstLine}
        editable={!off && state.agent !== null}
        placeholder={create.firstLineDefault}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={create.firstLine}
      />
      <View style={[localTaskStyles.card, styles.sendMode]}>
        <Send size={16} color={colors.textSecondary} />
        <View style={styles.flex}>
          <View style={styles.sendHead}>
            <Text style={styles.sendTitle}>{create.sendNow}</Text>
            <View style={localTaskStyles.label}>
              <Text style={localTaskStyles.labelText}>{create.sendFixed}</Text>
            </View>
          </View>
          <Text style={localTaskStyles.meta}>{create.sendFixedHint}</Text>
        </View>
      </View>
      {state.briefOn ? <LocalTaskCreateNote>{create.briefNote}</LocalTaskCreateNote> : null}
      <PickerModal
        visible={moreOpen}
        title={create.moreAgents}
        options={options.map((option) => ({ value: option.agent, label: option.label }))}
        selected={state.agent ?? ''}
        onSelect={(agent) => {
          const option = options.find((entry) => entry.agent === agent)
          if (option) {
            state.setAgentChoice(option.agent)
          }
          setMoreOpen(false)
        }}
        onClose={() => setMoreOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.lg },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    padding: spacing.md,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  tileOn: { borderColor: colors.textSecondary, backgroundColor: colors.bgRaised },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  label: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600',
    marginTop: spacing.sm
  },
  sendMode: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md
  },
  sendHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  sendTitle: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  flex: { flex: 1 }
})
