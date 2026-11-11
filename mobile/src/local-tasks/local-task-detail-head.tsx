import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CornerDownRight, GitBranch, Plus } from 'lucide-react-native'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { LocalTaskCardFacts } from './local-task-card-facts'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskStyles } from './local-tasks-styles'
import type { LocalTaskWorkControls } from './local-task-work-section'

/** The parents above a subtask, each one tap back up. */
export function LocalTaskAncestorPath(props: {
  ancestors: readonly LocalTask[]
  onOpenTask: (taskId: string) => void
}) {
  if (props.ancestors.length === 0) {
    return null
  }
  return (
    <View style={styles.parentRow} testID="local-task-ancestor-path">
      <CornerDownRight size={14} color={colors.textMuted} />
      {props.ancestors.map((ancestor, index) => (
        <Pressable
          key={ancestor.id}
          style={styles.ancestor}
          onPress={() => props.onOpenTask(ancestor.id)}
          accessibilityRole="button"
          accessibilityLabel={`${ancestor.title} ${ancestor.ref}`}
        >
          {index > 0 ? <Text style={localTaskStyles.meta}>›</Text> : null}
          <Text style={styles.parentTitle} numberOfLines={1}>
            {ancestor.title}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

/**
 * Where the task works (workspace · host · PR) and the head's one main action (m4), then whatever
 * the workspace controls have to say: why a button is off, what is starting, what failed.
 */
export function LocalTaskDetailWhere(props: {
  facts: LocalTaskCardFacts
  reviewDetail: string | null
  primary: LocalTaskWorkControls['primary']
  notices: ReactNode
  readOnly: boolean
}) {
  const card = localTasksCopy().work.card
  const { facts, primary } = props
  return (
    <>
      {facts.workspace ? (
        <View style={styles.whereRow} testID="local-task-detail-where">
          <GitBranch size={12} color={colors.textMuted} />
          <Text style={[localTaskStyles.meta, styles.shrink]} numberOfLines={1}>
            {[
              facts.workspace.name,
              facts.offline ? card.hostOffline(facts.hostName) : facts.hostName,
              props.reviewDetail
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      ) : null}
      {primary && !props.readOnly ? (
        <Pressable
          style={[styles.primary, primary.disabled && localTaskStyles.disabled]}
          disabled={primary.disabled}
          onPress={primary.onPress}
          accessibilityRole="button"
          testID="local-task-detail-primary"
        >
          <Plus size={15} color={colors.bgBase} />
          <Text style={styles.primaryText}>{primary.label}</Text>
        </Pressable>
      ) : null}
      <View style={styles.notices}>{props.notices}</View>
    </>
  )
}

const styles = StyleSheet.create({
  parentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md
  },
  ancestor: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  parentTitle: { flexShrink: 1, color: colors.textSecondary, fontSize: typography.metaSize },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  shrink: { flexShrink: 1 },
  // The light pill the prototype draws for the head's one main action.
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceBright
  },
  primaryText: { color: colors.bgBase, fontSize: typography.bodySize, fontWeight: '600' },
  notices: { gap: 4, marginTop: spacing.sm }
})
