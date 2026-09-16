// The only place a Goal record's runtime fence advances.
//
// A Goal fence is not an agent-session lease fence: it has no recovery floor, so "one past the
// current fence" is the whole rule. It still gets a named mint point for the same reason the
// agent-session one has: a client holding an older view must be refused rather than race the
// driver, and that argument is easier to audit at one call site than at four.

import type { GoalRecord } from './goal-store-records'

export function nextGoalRuntimeFence(record: Pick<GoalRecord, 'runtimeFence'>): number {
  return record.runtimeFence + 1
}
