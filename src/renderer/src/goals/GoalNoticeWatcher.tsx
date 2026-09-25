import { useEffect } from 'react'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import type { GoalSummary, GoalSummaryNotice } from '../../../shared/goals/goal-control-contract'
import type { NotificationDispatchResult } from '../../../shared/notification-settings-types'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../store'
import { isGoalHostInContact, type GoalHostContactState } from './goal-host-contact'
import { GoalRuntimeClient } from './goal-runtime-client'

const POLL_MS = 30_000
const SHOWN_STORAGE_KEY = 'orca.goals.shownNoticeIds'
const SHOWN_RETENTION_MS = 48 * 60 * 60_000
// Why only cooldown retries: every other refusal is the user's notification setting, not a glitch.
const RETRY_REASONS = new Set<NotificationDispatchResult['reason']>(['cooldown'])

/**
 * App-wide: goal notices reach the user whether or not the goals panel is open, which workspace
 * is selected, or which machine runs the goal. Execution hosts record notices; this shows them.
 */
export function GoalNoticeWatcher(): null {
  // Only hosts in contact; one that comes back is polled at once through the key change.
  const hostsKey = useAppStore(selectGoalHostsInContactKey)

  useEffect(() => {
    const hosts = hostsKey.split('\n').flatMap((value) => {
      const parsed = parseExecutionHostId(value)
      return parsed ? [parsed.id] : []
    })
    let disposed = false
    let running = false
    const poll = async (): Promise<void> => {
      if (running || disposed) {
        return
      }
      running = true
      try {
        for (const host of hosts) {
          if (disposed) {
            return
          }
          await pollHost(host)
        }
      } finally {
        running = false
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), POLL_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [hostsKey])

  return null
}

function selectGoalHostsInContactKey(
  state: GoalHostContactState & {
    repos?: readonly { connectionId?: string | null; executionHostId?: string | null }[]
    folderWorkspaces?: readonly { connectionId?: string | null; executionHostId?: string | null }[]
  }
): string {
  const hosts = new Set<string>(['local'])
  for (const owner of [...(state.repos ?? []), ...(state.folderWorkspaces ?? [])]) {
    hosts.add(getRepoExecutionHostId(owner))
  }
  return [...hosts]
    .filter((host) => isGoalHostInContact(state, host))
    .sort()
    .join('\n')
}

async function pollHost(host: ExecutionHostId): Promise<void> {
  let items: GoalSummary[]
  try {
    const client = new GoalRuntimeClient(host)
    items = (await client.list({ filter: 'all' })).items
  } catch {
    // Unreachable host (SSH down, old host): unverifiable, not empty. Notices wait on the host.
    return
  }
  const shown = readShown()
  let changed = false
  for (const summary of items) {
    for (const notice of summary.notices ?? []) {
      const key = `${host}|${summary.goalId}|${notice.id}`
      if (shown[key]) {
        continue
      }
      const settled = await dispatchNotice(summary, notice)
      if (settled) {
        shown[key] = Date.now()
        changed = true
      }
    }
  }
  if (changed) {
    writeShown(shown)
  }
}

/** @returns true once the notice needs no further attempt. */
async function dispatchNotice(summary: GoalSummary, notice: GoalSummaryNotice): Promise<boolean> {
  try {
    const result = await window.api.notifications.dispatch({
      source: 'agent-task-complete',
      notificationId: `goal:${summary.goalId}:${notice.id}`,
      worktreeLabel: workspaceLabel(summary.workspace.path),
      sessionTitle: translate('goals.notice.sessionTitle', 'Goal'),
      agentState: notice.kind === 'complete' ? 'done' : 'waiting',
      agentLastAssistantMessage: noticeBody(notice)
    })
    return result.delivered || !RETRY_REASONS.has(result.reason)
  } catch {
    return false
  }
}

function noticeBody(notice: GoalSummaryNotice): string {
  switch (notice.kind) {
    case 'question':
      return translate('goals.notice.question', 'The guard needs you: {{value0}}', {
        value0: notice.text
      })
    case 'guard-unavailable':
      return translate('goals.notice.guardUnavailable', 'The guard cannot run: {{value0}}', {
        value0: notice.text
      })
    case 'driver-fault':
      return translate('goals.notice.driverFault', 'The goal driver keeps failing: {{value0}}', {
        value0: notice.text
      })
    case 'driver-relaunch-limit':
      return translate(
        'goals.notice.relaunchLimit',
        'The goal driver exited three times within an hour. Automatic relaunch stopped; resume the goal once the cause is fixed.'
      )
    case 'complete':
      return translate('goals.notice.complete', 'Goal complete: {{value0}}', {
        value0: notice.text
      })
    case 'budget':
      return translate('goals.notice.budget', 'Budget used up: {{value0}}', {
        value0: notice.text
      })
    default:
      return notice.text
  }
}

function workspaceLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? path
}

function readShown(): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(SHOWN_STORAGE_KEY) ?? '{}')
    if (!raw || typeof raw !== 'object') {
      return {}
    }
    const now = Date.now()
    const kept: Record<string, number> = {}
    for (const [key, at] of Object.entries(raw)) {
      if (typeof at === 'number' && now - at < SHOWN_RETENTION_MS) {
        kept[key] = at
      }
    }
    return kept
  } catch {
    return {}
  }
}

function writeShown(shown: Record<string, number>): void {
  try {
    window.localStorage.setItem(SHOWN_STORAGE_KEY, JSON.stringify(shown))
  } catch {
    // Storage full or unavailable: worst case a notice repeats after a restart.
  }
}
