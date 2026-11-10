import { StyleSheet, Text, View } from 'react-native'
import { GitPullRequest } from 'lucide-react-native'
import { prStateColor } from '../components/WorktreeMetaGlyphs'
import { colors } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import type { LocalTaskWorkspaceReview } from './local-task-workspace-row'
import { localTaskStyles } from './local-tasks-styles'

/** "PR #231 merged", as the host has it; out of contact the state is not claimed as current. */
export function localTaskReviewLabel(review: LocalTaskWorkspaceReview, inContact: boolean): string {
  const work = localTasksCopy().work
  const label = review.kind === 'pr' ? work.review.pr(review.number) : work.review.mr(review.number)
  const state = review.state.toLowerCase()
  return !inContact
    ? work.review.unverifiable(label)
    : state === 'open' || state === 'draft' || state === 'merged' || state === 'closed'
      ? work.review[state](label)
      : label
}

/**
 * The workspace's PR or MR as its host has it, with its checks (REQ-012), colored as the host
 * list's PR chip. Out of contact the cached state is not claimed as current.
 */
export function LocalTaskWorkspaceReviewLine(props: {
  review: LocalTaskWorkspaceReview
  inContact: boolean
}) {
  const work = localTasksCopy().work
  const { review } = props
  const said = localTaskReviewLabel(review, props.inContact)
  const checks =
    props.inContact && review.checks && review.checks !== 'neutral'
      ? work.checks[review.checks]
      : null
  return (
    <View style={styles.review} testID="local-task-workspace-review">
      <GitPullRequest
        size={12}
        color={props.inContact ? prStateColor(review.state) : colors.textMuted}
      />
      <Text style={localTaskStyles.meta} numberOfLines={1}>
        {[said, checks].filter(Boolean).join(' · ')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  review: { flexDirection: 'row', alignItems: 'center', gap: 4 }
})
