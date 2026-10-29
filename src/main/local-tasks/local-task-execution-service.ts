import { z, type ZodType } from 'zod'
import type {
  LocalTaskLinks,
  LocalTaskProgressSnapshot
} from '../../shared/local-tasks/local-task-link-types'
import type {
  LocalTaskChangeScope,
  LocalTaskEventSource,
  LocalTaskFailure
} from '../../shared/local-tasks/local-task-types'
import type {
  LocalTasksAttentionSnoozeInput,
  LocalTasksLinksLinkWorkspaceInput,
  LocalTasksLinksRecordSessionInput,
  LocalTasksLinksResolveWorkspaceInput,
  LocalTasksRulesApplyPrMergedInput
} from '../../shared/local-tasks/local-tasks-link-rpc-params'
import {
  sessionLinkSchema,
  workspaceLinkSchema,
  writeResultSchema
} from '../../shared/local-tasks/local-task-result-schemas'
import type { LocalTasksDatabase } from './local-tasks-database'
import {
  acknowledgeLocalTaskAttention,
  snoozeLocalTaskAttention
} from './local-task-attention-store'
import { LocalTaskAttentionMonitor } from './local-task-attention-monitor'
import {
  SILENT_LOCAL_TASK_HOST_SESSIONS,
  type LocalTaskHostSessionSource
} from './local-task-host-session-source'
import { readLocalTaskLinks } from './local-task-link-rows'
import { runLocalTaskWrite } from './local-task-mutation-receipts'
import { applyLocalTaskPrMergedRule } from './local-task-rules'
import { recordLocalTaskSession, unlinkLocalTaskSession } from './local-task-session-links'
import {
  linkLocalTaskWorkspace,
  resolveLocalTaskWorkspace,
  unlinkLocalTaskWorkspace
} from './local-task-workspace-links'

const WORKSPACE_RESULT = writeResultSchema({ workspace: workspaceLinkSchema })
const SESSION_RESULT = writeResultSchema({ session: sessionLinkSchema })
const APPLIED_RESULT = writeResultSchema({ applied: z.boolean() })
const EMPTY_RESULT = writeResultSchema({})

/** Changes that never pass through a database commit: a session's judged progress moving. */
export type LocalTaskVolatileChange = (scopes: LocalTaskChangeScope[]) => void

/** Task ↔ workspace and session links, the host's own "needs you" judgment, and rules. */
export class LocalTaskExecutionService {
  private readonly attention: LocalTaskAttentionMonitor

  constructor(
    private readonly db: LocalTasksDatabase,
    private readonly now: () => number,
    onVolatileChange: LocalTaskVolatileChange = () => {},
    sessions: LocalTaskHostSessionSource = SILENT_LOCAL_TASK_HOST_SESSIONS
  ) {
    this.attention = new LocalTaskAttentionMonitor(db, now, sessions, onVolatileChange)
  }

  /** Listens to the host's status changes while a session is linked; else judges only on reads. */
  start(): void {
    this.attention.start()
  }

  listLinks(): LocalTaskLinks {
    return readLocalTaskLinks(this.db)
  }

  linkWorkspace(input: LocalTasksLinksLinkWorkspaceInput, source: LocalTaskEventSource) {
    return this.write(
      input.clientOperationId,
      'links.linkWorkspace',
      input,
      WORKSPACE_RESULT,
      (now) => linkLocalTaskWorkspace(this.db, input, source, now)
    )
  }

  resolveWorkspace(input: LocalTasksLinksResolveWorkspaceInput, source: LocalTaskEventSource) {
    return this.write(
      input.clientOperationId,
      'links.resolveWorkspace',
      input,
      WORKSPACE_RESULT,
      (now) => resolveLocalTaskWorkspace(this.db, input, source, now)
    )
  }

  unlinkWorkspace(
    input: { clientOperationId: string; taskId: string },
    source: LocalTaskEventSource
  ) {
    return this.write(
      input.clientOperationId,
      'links.unlinkWorkspace',
      input,
      EMPTY_RESULT,
      (now) => unlinkLocalTaskWorkspace(this.db, input.taskId, source, now)
    )
  }

  /** Its commit re-arms judgment, so a session recorded by tab alone gets its pane claimed. */
  recordSession(input: LocalTasksLinksRecordSessionInput, source: LocalTaskEventSource) {
    return this.write(
      input.clientOperationId,
      'links.recordSession',
      input,
      SESSION_RESULT,
      (now) => recordLocalTaskSession(this.db, input, source, now)
    )
  }

  unlinkSession(
    input: { clientOperationId: string; sessionLinkId: string },
    source: LocalTaskEventSource
  ) {
    return this.write(input.clientOperationId, 'links.unlinkSession', input, EMPTY_RESULT, (now) =>
      unlinkLocalTaskSession(this.db, input.sessionLinkId, source, now)
    )
  }

  /** Judged now from this host's agent status; works on a read-only library too. */
  getProgress(): LocalTaskProgressSnapshot {
    return this.attention.snapshot()
  }

  acknowledge(input: { clientOperationId: string; itemKey: string; taskSessionId: string }) {
    const result = this.write(
      input.clientOperationId,
      'attention.acknowledge',
      input,
      EMPTY_RESULT,
      (now) =>
        acknowledgeLocalTaskAttention(
          this.db,
          input,
          this.attention.markTarget(input.itemKey, input.taskSessionId),
          now
        )
    )
    this.attention.schedule()
    return result
  }

  snooze(input: LocalTasksAttentionSnoozeInput) {
    const result = this.write(
      input.clientOperationId,
      'attention.snooze',
      input,
      EMPTY_RESULT,
      (now) =>
        snoozeLocalTaskAttention(
          this.db,
          input,
          this.attention.markTarget(input.itemKey, input.taskSessionId),
          now
        )
    )
    // Why: re-arms the local timer that announces the snooze's end.
    this.attention.schedule()
    return result
  }

  applyPrMerged(input: LocalTasksRulesApplyPrMergedInput) {
    return this.write(
      input.clientOperationId,
      'rules.applyPrMerged',
      input,
      APPLIED_RESULT,
      (now) => applyLocalTaskPrMergedRule(this.db, input, now)
    )
  }

  dispose(): void {
    this.attention.dispose()
  }

  private write<T extends { ok: boolean }>(
    clientOperationId: string,
    method: string,
    params: unknown,
    resultSchema: ZodType<T>,
    operation: (now: number) => T
  ): T | LocalTaskFailure {
    return runLocalTaskWrite(
      this.db,
      this.now(),
      clientOperationId,
      method,
      params,
      resultSchema,
      operation
    )
  }
}
