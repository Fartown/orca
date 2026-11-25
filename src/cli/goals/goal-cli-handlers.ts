import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { GoalAcceptanceDraft } from '../../shared/goals/goal-acceptance-draft-contract'
import type {
  GoalCreateParams,
  GoalDetail,
  GoalOperation,
  GoalSummary
} from '../../shared/goals/goal-control-contract'
import { fingerprintPayload } from '../../shared/goals/goal-payload-fingerprint'
import type { RuntimeTerminalSummary } from '../../shared/terminal/runtime/runtime-terminal-contracts'
import { readTextOrFileFlag } from '../arguments/command-body-input'
import type { CommandHandler, HandlerContext } from '../dispatch/dispatch'
import {
  getOptionalNonNegativeIntegerFlag,
  getOptionalStringFlag,
  getRequiredStringFlag
} from '../arguments/flags'
import { printResult } from '../output/command-result-output'
import type { RuntimeClient } from '../runtime/client'
import { RuntimeClientError } from '../runtime/connection/types'
import { formatDraft, formatGoalDetail, formatGoalList, formatOperation } from './goal-cli-format'

// The CLI talks to one Orca: this machine's, or the paired server picked by --environment.
// That server owns the workspace, so every call names itself as the authority.
const HOST = { authorityExecutionHostId: 'local' as const }
const DRAFT_POLL_MS = 2_000
const DRAFT_WAIT_MS = 20 * 60_000
const DEFAULT_BUDGET = { maxTurns: 20, maxMinutes: 180, checkTimeoutSeconds: 900 }

type GoalCallParams = Record<string, unknown>

async function call<T>(client: RuntimeClient, method: string, params: GoalCallParams) {
  return client.call<T>(method, { ...HOST, ...params }, { timeoutMs: 60_000 })
}

async function showTerminal(ctx: HandlerContext): Promise<RuntimeTerminalSummary> {
  const handle = getRequiredStringFlag(ctx.flags, 'terminal')
  const response = await ctx.client.call<{ terminal: RuntimeTerminalSummary }>('terminal.show', {
    terminal: handle
  })
  return response.result.terminal
}

function bindingOf(terminal: RuntimeTerminalSummary): GoalCreateParams['binding'] {
  if (!terminal.incarnationId) {
    throw new RuntimeClientError(
      'goal_terminal_unpinned',
      'This terminal has no running process to bind a goal to. Start the agent in it first.'
    )
  }
  return {
    worktree: terminal.worktreeId,
    terminal: terminal.handle,
    expectedIncarnationId: terminal.incarnationId
  }
}

function guardFlag(ctx: HandlerContext, terminal: RuntimeTerminalSummary): 'claude' | 'codex' {
  const value = getOptionalStringFlag(ctx.flags, 'guard')
  if (value === undefined) {
    return terminal.agentIdentity === 'codex' ? 'claude' : 'codex'
  }
  if (value !== 'claude' && value !== 'codex') {
    throw new RuntimeClientError('invalid_argument', '--guard must be claude or codex')
  }
  return value
}

function positional(ctx: HandlerContext, name: string, what: string): string {
  const value = getOptionalStringFlag(ctx.flags, name)?.trim()
  if (!value) {
    throw new RuntimeClientError('invalid_argument', `Pass the ${what}.`)
  }
  return value
}

async function readDraft(client: RuntimeClient, draftId: string) {
  const response = await call<GoalAcceptanceDraft | null>(client, 'goals.getAcceptanceDraft', {
    draftId
  })
  if (!response.result) {
    throw new RuntimeClientError(
      'goal_draft_not_found',
      `No checklist draft ${draftId} on this host.`
    )
  }
  return { ...response, result: response.result }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const GOAL_CLI_HANDLERS: Record<string, CommandHandler> = {
  'goal draft': async (ctx) => {
    const objective = (await readTextOrFileFlag(ctx.flags, ctx.cwd, 'objective', true))?.trim()
    if (!objective) {
      throw new RuntimeClientError('invalid_argument', 'The objective is empty.')
    }
    const terminal = await showTerminal(ctx)
    const response = await call<GoalAcceptanceDraft>(ctx.client, 'goals.draftAcceptance', {
      draftId: randomUUID(),
      binding: bindingOf(terminal),
      objective,
      judge: guardFlag(ctx, terminal)
    })
    printResult(response, ctx.json, formatDraft)
  },

  'goal checklist': async (ctx) => {
    const draftId = positional(ctx, 'draft', 'checklist draft id')
    let response = await readDraft(ctx.client, draftId)
    const deadline = Date.now() + DRAFT_WAIT_MS
    while (ctx.flags.get('wait') === true && response.result.status === 'generating') {
      if (Date.now() > deadline) {
        throw new RuntimeClientError(
          'timeout',
          'The checklist is still being written; try again later.'
        )
      }
      await sleep(DRAFT_POLL_MS)
      response = await readDraft(ctx.client, draftId)
    }
    printResult(response, ctx.json, formatDraft)
  },

  'goal start': async (ctx) => {
    const draftId = positional(ctx, 'draft', 'checklist draft id')
    const draft = (await readDraft(ctx.client, draftId)).result
    if (draft.status !== 'ready' || !draft.document) {
      throw new RuntimeClientError(
        'goal_draft_not_ready',
        `The checklist is ${draft.status}${draft.error ? `: ${draft.error}` : ''}. Start only from a ready checklist the user has confirmed.`
      )
    }
    const terminal = await showTerminal(ctx)
    // Why: a checklist judges the objective and workspace it was written for; the server does not re-check this.
    if (draft.workspace !== terminal.worktreePath) {
      throw new RuntimeClientError(
        'goal_draft_stale',
        `The checklist was written for ${draft.workspace}, but this terminal is in ${terminal.worktreePath}. Draft again for this workspace.`
      )
    }
    const documentPath = getOptionalStringFlag(ctx.flags, 'document')
    const document = documentPath
      ? await readFile(
          isAbsolute(documentPath) ? documentPath : join(ctx.cwd, documentPath),
          'utf8'
        )
      : draft.document
    if (!document.trim()) {
      throw new RuntimeClientError('invalid_argument', 'The checklist document is empty.')
    }
    const payload = {
      binding: bindingOf(terminal),
      spec: {
        objective: draft.objective,
        criteria: [],
        acceptanceText: document,
        acceptanceDocument: document,
        extraChecks: [],
        checkAll: false,
        onBlocked: 'ask' as const,
        judge: draft.judge
      },
      budget: {
        ...DEFAULT_BUDGET,
        maxTurns:
          getOptionalNonNegativeIntegerFlag(ctx.flags, 'max-turns') ?? DEFAULT_BUDGET.maxTurns,
        maxMinutes:
          getOptionalNonNegativeIntegerFlag(ctx.flags, 'max-minutes') ?? DEFAULT_BUDGET.maxMinutes
      },
      acknowledgeUnverifiedCompletion: false
    }
    const response = await call<GoalOperation>(ctx.client, 'goals.create', {
      ...payload,
      clientOperationId: randomUUID(),
      payloadFingerprint: fingerprintPayload(payload)
    })
    printResult(response, ctx.json, formatOperation)
  },

  'goal status': async (ctx) => {
    const goalId = getOptionalStringFlag(ctx.flags, 'goal')?.trim()
    if (goalId) {
      const response = await call<GoalDetail | null>(ctx.client, 'goals.get', { goalId })
      if (!response.result) {
        throw new RuntimeClientError('goal_not_found', `No goal ${goalId} on this host.`)
      }
      printResult({ ...response, result: response.result }, ctx.json, formatGoalDetail)
      return
    }
    const response = await call<{ items: GoalSummary[] }>(ctx.client, 'goals.list', {
      filter: ctx.flags.get('all') === true ? 'all' : 'running'
    })
    printResult(response, ctx.json, formatGoalList)
  },

  'goal stop': async (ctx) => {
    const goalId = positional(ctx, 'goal', 'goal id')
    const detail = (await call<GoalDetail | null>(ctx.client, 'goals.get', { goalId })).result
    if (!detail) {
      throw new RuntimeClientError('goal_not_found', `No goal ${goalId} on this host.`)
    }
    const envelope = {
      goalId,
      expectedRuntimeFence: detail.runtimeFence,
      expectedRunId: detail.runId,
      action: 'stop' as const
    }
    const response = await call<GoalOperation>(ctx.client, 'goals.control', {
      ...envelope,
      clientOperationId: randomUUID(),
      payloadFingerprint: fingerprintPayload(envelope)
    })
    printResult(response, ctx.json, formatOperation)
  }
}
