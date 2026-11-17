import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { CornerDownRight, GitBranch, Plus } from 'lucide-react-native'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import type { LocalTaskCardFacts } from './local-task-card-facts'
import { localTasksCopy } from './local-tasks-copy'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { localTaskStyles } from './local-tasks-styles'
import type { LocalTaskWorkControls } from './local-task-work-section'

/** The parents above a subtask, each one tap back up. */
export function LocalTaskAncestorPath(props: {
  ancestors: readonly LocalTask[]
  onOpenTask: (taskId: string) => void
}) {
  useMobileColorScheme()
  if (props.ancestors.length === 0) {
    return null
  }
  return (
    <View style={styles.parentRow} testID="local-task-ancestor-path">
      <View style={styles.iconColumn}>
        <CornerDownRight size={14} color={colors.textMuted} />
      </View>
      <View style={styles.parentLinks}>
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
  inheritedFrom: LocalTaskWorkControls['inheritedFrom']
  notices: ReactNode
  readOnly: boolean
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const card = localTasksCopy().work.card
  const { facts, primary } = props
  return (
    <>
      {facts.workspace ? (
        <View style={styles.whereRow} testID="local-task-detail-where">
          <View style={styles.iconColumn}>
            <GitBranch size={14} color={colors.textMuted} />
          </View>
          <View style={styles.whereText} testID="local-task-detail-where-text">
            <Text style={[localTaskStyles.meta, styles.shrink]} numberOfLines={1}>
              {facts.workspace.name}
            </Text>
            <Text style={localTaskStyles.meta}>
              {facts.offline ? card.hostOffline(facts.hostName) : facts.hostName}
            </Text>
            {props.reviewDetail ? (
              <Text style={localTaskStyles.meta}>{props.reviewDetail}</Text>
            ) : null}
            {props.inheritedFrom ? (
              <Text style={styles.inherited}>
                {t('localTasks.detail.inheritedFrom', 'From {{title}}', {
                  title: props.inheritedFrom.title
                })}
              </Text>
            ) : null}
          </View>
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
          <Plus size={14} color={colors.bgBase} />
          <Text style={styles.primaryText}>{primary.label}</Text>
        </Pressable>
      ) : null}
      {props.notices ? <View style={styles.notices}>{props.notices}</View> : null}
    </>
  )
}

const styles = themedStyleSheet(() => ({
  parentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  iconColumn: { width: spacing.lg, alignItems: 'center' },
  parentLinks: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  ancestor: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  parentTitle: { flexShrink: 1, color: colors.textSecondary, fontSize: typography.metaSize },
  whereRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  whereText: { flex: 1, minWidth: 0, gap: spacing.xs },
  shrink: { flexShrink: 1, minWidth: 0 },
  inherited: { color: colors.textMuted, fontSize: typography.metaSize },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    borderRadius: radii.control,
    backgroundColor: colors.surfaceBright
  },
  primaryText: {
    flexShrink: 1,
    color: colors.bgBase,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  notices: { gap: 4, marginTop: spacing.sm }
}))
