import {
  isLocalTaskAttentionKeyOfPane,
  localTaskAttentionItem,
  localTaskAttentionKey,
  localTaskRowStaleAt,
  localTaskRowState,
  localTaskRowWords,
  type LocalTaskStatusRow
} from '../../shared/local-tasks/local-task-attention-rules'
import type {
  LocalTaskAttentionItem,
  LocalTaskProgressSnapshot,
  LocalTaskSessionLink,
  LocalTaskSessionProgress,
  LocalTaskSessionState
} from '../../shared/local-tasks/local-task-link-types'
import type { LocalTaskChangeScope } from '../../shared/local-tasks/local-task-types'
import {
  nextLocalTaskSnoozeExpiry,
  readLocalTaskAttentionStates,
  type LocalTaskAttentionMarkTarget,
  type LocalTaskAttentionState
} from './local-task-attention-store'
import type { LocalTaskHostSessionSource } from './local-task-host-session-source'
import { hasLocalTaskSessionLinks, readLocalTaskLinks } from './local-task-link-rows'
import { LocalTaskPaneMemory } from './local-task-pane-memory'
import { findLocalTaskPane, latestLocalTaskRow } from './local-task-host-pane-match'
import { claimLocalTaskSessionPane } from './local-task-session-links'
import {
  readLocalTaskTurnEnd,
  writeLocalTaskTurnEnds,
  type LocalTaskTurnEnd
} from './local-task-turn-records'
import type { LocalTasksDatabase } from './local-tasks-database'

// Why: hook events arrive per tool call; one judgment per window bounds the work and the notices.
const REFRESH_COALESCE_MS = 150
// Why: setTimeout overflows past 2^31-1 ms; a later deadline re-arms on the way.
const MAX_TIMER_MS = 2_147_483_647
const LIVE_STATES: readonly LocalTaskSessionState[] = ['working', 'waiting', 'blocked', 'done']

type Judgment = {
  sessions: LocalTaskSessionProgress[]
  /** Every item the rules raise, seen, snoozed or not; marks on any other key may be pruned. */
  candidates: LocalTaskAttentionItem[]
  items: LocalTaskAttentionItem[]
  staleAt: number | null
  claims: { sessionLinkId: string; paneKey: string }[]
  turnEnds: LocalTaskTurnEnd[]
  /** Each session's own pane, claimed or found now. */
  panes: Map<string, string | null>
}

/**
 * Judges every linked session from this host's own agent status (REQ-014, D-008): progress, the
 * "needs you" items and the panes of sessions recorded by tab alone. Re-judges when the host
 * pushes a status, pane or contact change, and at its own snooze and staleness deadlines.
 * Watches the host only while some session is linked; link writes switch that, never a timer.
 */
export class LocalTaskAttentionMonitor {
  private readonly panes = new LocalTaskPaneMemory()
  private published: string | null = null
  private coalesceTimer: ReturnType<typeof setTimeout> | null = null
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null
  private stopSource: (() => void) | null = null
  private stopCommits: (() => void) | null = null

  constructor(
    private readonly db: LocalTasksDatabase,
    private readonly now: () => number,
    private readonly source: LocalTaskHostSessionSource,
    private readonly onChange: (scopes: LocalTaskChangeScope[]) => void
  ) {}

  start(): void {
    this.stopCommits ??= this.db.onCommit((commit) => {
      if (commit.scopes.includes('links')) {
        this.followLinks()
      }
    })
    this.followLinks()
  }

  dispose(): void {
    this.stopCommits?.()
    this.stopCommits = null
    this.stopWatching()
  }

  snapshot(): LocalTaskProgressSnapshot {
    const now = this.now()
    const { sessions, items } = this.judge(now)
    return { observedAt: now, sessions, items }
  }

  /** Where a seen or snooze mark for this pair would land in the judgment now. */
  markTarget(itemKey: string, taskSessionId: string): LocalTaskAttentionMarkTarget {
    const judgment = this.judge(this.now())
    const raised = judgment.candidates.find((item) => item.key === itemKey)
    const pane = judgment.panes.get(taskSessionId) ?? null
    let standing: LocalTaskAttentionMarkTarget['standing'] = 'other-session'
    if (raised) {
      standing = raised.taskSessionId === taskSessionId ? 'raised' : 'other-session'
    } else if (pane !== null && isLocalTaskAttentionKeyOfPane(itemKey, pane)) {
      const outOfContact = judgment.sessions.some(
        (session) => session.taskSessionId === taskSessionId && session.state === 'unverifiable'
      )
      standing = outOfContact ? 'unverifiable' : 'moved-on'
    }
    return { standing, liveKeys: new Set(judgment.candidates.map((item) => item.key)) }
  }

  /** Whether a key may still be raised: it is now (seen or snoozed too), or its pane is out of contact. */
  attentionKeyMayReturn(): (key: string) => boolean {
    const judgment = this.judge(this.now())
    const raised = new Set(judgment.candidates.map((item) => item.key))
    const unjudgedPanes = judgment.sessions.flatMap((session) => {
      const pane =
        session.state === 'unverifiable' ? judgment.panes.get(session.taskSessionId) : null
      return pane ? [pane] : []
    })
    return (key) =>
      raised.has(key) || unjudgedPanes.some((pane) => isLocalTaskAttentionKeyOfPane(key, pane))
  }

  /** Re-judge soon: a status, mark or link changed. Idle until started. */
  schedule(): void {
    if (this.coalesceTimer || !this.stopSource) {
      return
    }
    this.coalesceTimer = setTimeout(() => {
      this.coalesceTimer = null
      this.refresh()
    }, REFRESH_COALESCE_MS)
    this.coalesceTimer.unref?.()
  }

  /** No link, no host subscription: a status change then costs this library nothing (orcad too). */
  private followLinks(): void {
    if (!hasLocalTaskSessionLinks(this.db)) {
      this.stopWatching()
    } else if (this.stopSource) {
      this.schedule()
    } else {
      this.stopSource = this.source.subscribe(() => this.schedule())
      this.refresh()
    }
  }

  private stopWatching(): void {
    this.stopSource?.()
    this.stopSource = null
    this.clearTimers()
    this.published = null
    this.panes.clear()
  }

  // Why caught: it runs from timers, where a throw would reach the process's uncaught handler.
  private refresh(): void {
    try {
      this.refreshNow()
    } catch (error) {
      console.error('[local-tasks] judging linked sessions failed', error)
    }
  }

  private refreshNow(): void {
    const now = this.now()
    let judgment = this.judge(now)
    if (judgment.claims.length > 0 && !this.db.readOnly) {
      try {
        this.db.transaction(() => {
          for (const claim of judgment.claims) {
            claimLocalTaskSessionPane(this.db, claim.sessionLinkId, claim.paneKey)
          }
        })
        judgment = this.judge(now)
      } catch (error) {
        console.error('[local-tasks] claiming session panes failed', error)
      }
    }
    if (judgment.turnEnds.length > 0 && !this.db.readOnly) {
      this.db.transaction(() => writeLocalTaskTurnEnds(this.db, judgment.turnEnds, now))
    }
    const content = JSON.stringify([judgment.sessions, judgment.items])
    if (this.published !== null && content !== this.published) {
      this.onChange(['attention'])
    }
    this.published = content
    this.armDeadline(judgment, now)
  }

  private judge(now: number): Judgment {
    const { sessions: links } = readLocalTaskLinks(this.db)
    const marks = readLocalTaskAttentionStates(this.db)
    const claimedPanes = new Set(links.flatMap((link) => (link.paneKey ? [link.paneKey] : [])))
    const judgment: Judgment = {
      sessions: [],
      candidates: [],
      items: [],
      staleAt: null,
      claims: [],
      turnEnds: [],
      panes: new Map()
    }
    let paneKeys: readonly string[] | null = null
    const knownPaneKeys = (): readonly string[] => (paneKeys ??= this.source.paneKeys())
    for (const link of [...links].sort((a, b) => a.id.localeCompare(b.id))) {
      const paneKey = link.paneKey ?? findLocalTaskPane(link, knownPaneKeys, claimedPanes)
      if (paneKey && !link.paneKey) {
        claimedPanes.add(paneKey)
        judgment.claims.push({ sessionLinkId: link.id, paneKey })
      }
      judgment.panes.set(link.id, paneKey)
      this.judgeSession(link, paneKey, marks, now, judgment)
    }
    this.panes.keepOnly(judgment.panes.values())
    judgment.items.sort((a, b) => b.since - a.since || a.key.localeCompare(b.key))
    return judgment
  }

  private judgeSession(
    link: LocalTaskSessionLink,
    paneKey: string | null,
    marks: ReadonlyMap<string, LocalTaskAttentionState>,
    now: number,
    judgment: Judgment
  ): void {
    const prose = paneKey ? this.panes.proseOf(paneKey) : null
    const saved = readLocalTaskTurnEnd(this.db, link.id)
    const progress = (
      state: LocalTaskSessionState,
      row: LocalTaskStatusRow | null = null,
      unread = false
    ): LocalTaskSessionProgress => ({
      taskSessionId: link.id,
      state,
      lastMessage: localTaskRowWords(row, prose) || saved?.body || null,
      stateSince: row?.stateStartedAt ?? null,
      unread
    })
    // Loss of contact is never evidence: the session may still run on that SSH target.
    if (!this.source.inContact(link.hostId)) {
      judgment.sessions.push(progress('unverifiable'))
      return
    }
    if (!paneKey) {
      judgment.sessions.push(progress('unknown'))
      return
    }
    const row = latestLocalTaskRow(this.source.rowsForPane(paneKey))
    if (!row) {
      // Why: only a pane that reported this process can be said to have ended, its agent gone or
      // its tab closed (REQ-012); a quiet one may be an agent without status hooks, or a pane the
      // window has not reattached yet.
      judgment.sessions.push(progress(this.panes.hasReported(paneKey) ? 'exited' : 'unknown'))
      return
    }
    this.panes.heard(paneKey, row)
    const state = localTaskRowState(row, this.source.terminalLive(paneKey), now)
    const key = localTaskAttentionKey(row.paneKey, row.stateStartedAt)
    const mark = marks.get(key)
    const words = localTaskRowWords(row, this.panes.proseOf(paneKey))
    const finishedTurn =
      state === 'done' && row.sessionBoundary !== true && row.restoredUnconfirmed !== true
    const unread = finishedTurn && (mark?.seenAt ?? null) === null
    if (finishedTurn && (saved?.key !== key || (words !== null && words !== saved.body))) {
      judgment.turnEnds.push({
        sessionLinkId: link.id,
        taskId: link.taskId,
        key,
        body: words || saved?.body || '',
        sessionOpenedAt: link.openedAt
      })
    }
    const staleAt = localTaskRowStaleAt(row)
    if (staleAt !== null && staleAt > now) {
      judgment.staleAt = Math.min(judgment.staleAt ?? staleAt, staleAt)
    }
    judgment.sessions.push(progress(state, row, unread))
    // Why finishedTurn, not unread: a seen turn stays a candidate, so its seen mark is never pruned.
    const item = localTaskAttentionItem(link, {
      state,
      row: LIVE_STATES.includes(state) ? row : null,
      structured: link.surface === 'chat' || row.structuredHost !== undefined,
      unread: finishedTurn,
      lastMessage: words
    })
    if (!item) {
      return
    }
    judgment.candidates.push(item)
    const snoozedUntil = mark?.snoozedUntil ?? null
    if ((mark?.seenAt ?? null) === null && (snoozedUntil === null || snoozedUntil <= now)) {
      judgment.items.push(item)
    }
  }

  private armDeadline(judgment: Judgment, now: number): void {
    if (this.deadlineTimer) {
      clearTimeout(this.deadlineTimer)
      this.deadlineTimer = null
    }
    const snoozeEnd = nextLocalTaskSnoozeExpiry(
      this.db,
      new Set(judgment.candidates.map((item) => item.key)),
      now
    )
    const deadlines = [snoozeEnd, judgment.staleAt].filter(
      (value): value is number => value !== null
    )
    if (deadlines.length === 0) {
      return
    }
    const delay = Math.max(0, Math.min(...deadlines) - now)
    this.deadlineTimer = setTimeout(
      () => {
        this.deadlineTimer = null
        this.refresh()
      },
      Math.min(delay, MAX_TIMER_MS)
    )
    this.deadlineTimer.unref?.()
  }

  private clearTimers(): void {
    for (const timer of [this.coalesceTimer, this.deadlineTimer]) {
      if (timer) {
        clearTimeout(timer)
      }
    }
    this.coalesceTimer = null
    this.deadlineTimer = null
  }
}
