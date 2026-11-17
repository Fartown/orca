import type {
  LocalTaskAttentionItem,
  LocalTaskSessionProgress
} from '../../shared/local-tasks/local-task-link-types'
import type { LocalTaskTurnEnd } from './local-task-turn-records'

export type LocalTaskAttentionJudgment = {
  sessions: LocalTaskSessionProgress[]
  /** Every raised item, including seen or snoozed ones. */
  candidates: LocalTaskAttentionItem[]
  items: LocalTaskAttentionItem[]
  staleAt: number | null
  claims: { sessionLinkId: string; paneKey: string }[]
  turnEnds: LocalTaskTurnEnd[]
  panes: Map<string, string | null>
}
