import { z } from 'zod'
import { LocalTaskProposalItemSchema } from '../../shared/local-tasks/local-task-dispatcher-rpc-params'
import { inboxSchema, proposalSchema } from '../../shared/local-tasks/local-task-dispatcher-schemas'
import type { LocalTaskInbox } from '../../shared/local-tasks/local-task-dispatcher-types'
import { localTaskProgressSnapshotSchema } from '../../shared/local-tasks/local-task-link-read-schemas'
import { readCommandBody } from '../command-body-input'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { cliTime } from './local-task-cli-format'
import {
  callLibrary,
  readTaskLibrary,
  resolveTaskRef,
  write,
  type TaskLibrary
} from './local-task-cli-library'

const PROPOSAL_MAX = 200_000
const PROPOSAL_BODY = z.union([
  z.array(z.unknown()).transform((items) => ({ summary: undefined, items })),
  z.object({ summary: z.string().optional(), items: z.array(z.unknown()) })
])
const ATTENTION_WORDS: Record<string, string> = {
  approval: 'waits to approve',
  question: 'waits for an answer',
  blocked: 'is blocked',
  'unread-done': 'finished a round, unread'
}

/** The dispatcher's own pane; Orca finds the conversation by it (REQ-030). */
function dispatcherPane(): string {
  const paneKey = process.env.ORCA_PANE_KEY
  if (!paneKey) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Run this inside the dispatcher session that Orca started; ORCA_PANE_KEY is not set.'
    )
  }
  return paneKey
}

/** A task by its id or any ref the task page accepts. */
function taskIdOf(library: TaskLibrary, value: string): string {
  return library.tasks.some((task) => task.id === value)
    ? value
    : resolveTaskRef(library, value).task.id
}

/** Lets a proposal name tasks by ref, as the dispatcher reads them in `orca task list`. */
function resolveProposalRefs(library: TaskLibrary, item: unknown): unknown {
  if (!item || typeof item !== 'object') {
    return item
  }
  const record = { ...(item as Record<string, unknown>) }
  for (const key of ['taskId', 'parentTaskId']) {
    if (typeof record[key] === 'string') {
      record[key] = taskIdOf(library, record[key])
    }
  }
  if ((record.kind === 'append' || record.kind === 'stop') && !record.sessionLinkId) {
    record.sessionLinkId = onlySessionOf(library, record.taskId)
  }
  return record
}

/** An append or stop may leave out the session when the task has exactly one. */
function onlySessionOf(library: TaskLibrary, taskId: unknown): string | undefined {
  const sessions = library.links.sessions.filter((session) => session.taskId === taskId)
  if (sessions.length === 1 || typeof taskId !== 'string') {
    return sessions[0]?.id
  }
  const ref = library.tasks.find((task) => task.id === taskId)?.ref ?? taskId
  throw new RuntimeClientError(
    'invalid_argument',
    sessions.length === 0
      ? `${ref} has no session to send to or stop.`
      : `${ref} has ${sessions.length} sessions; name one with "sessionLinkId" (see orca task show ${ref}).`
  )
}

function formatInbox(result: { inbox: LocalTaskInbox }): string {
  const { inbox } = result
  // Why the cursor even when empty: hidden notes still use the page and must be acked past.
  if (inbox.items.length === 0) {
    return [
      `Nothing new on the ${inbox.watchedTaskCount} watched task(s).`,
      ...(inbox.more
        ? ['More items wait.', `Move past this page: orca task inbox --ack ${inbox.cursor}`]
        : [])
    ].join('\n')
  }
  const lines = inbox.items.map((item) => {
    const needs = item.needsYou ? `\n      needs the user: ${item.needsYou}` : ''
    return `${cliTime(item.at)}  ${item.kind}  ${item.taskRef ?? '-'}  ${item.summary}${needs}`
  })
  const more = inbox.more ? ['More items wait; ack these, then read again.'] : []
  return [...lines, ...more, `When handled: orca task inbox --ack ${inbox.cursor}`].join('\n')
}

export const LOCAL_TASK_DISPATCHER_CLI_HANDLERS: Record<string, CommandHandler> = {
  'task propose': async ({ client, flags, json, cwd }) => {
    const paneKey = dispatcherPane()
    const text = await readCommandBody(flags, cwd, {
      required: true,
      maximumCharacters: PROPOSAL_MAX,
      tooLargeCode: 'invalid_argument',
      label: 'Proposal'
    })
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(text)
    } catch {
      throw new RuntimeClientError('invalid_argument', 'The proposal is not valid JSON.')
    }
    const body = PROPOSAL_BODY.safeParse(parsedJson)
    if (!body.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Write the proposal as { "summary": "...", "items": [ ... ] } or as an array of items.'
      )
    }
    const library = await readTaskLibrary(client, { access: 'write', links: true })
    const items = LocalTaskProposalItemSchema.array()
      .min(1)
      .max(20)
      .safeParse(body.data.items.map((item) => resolveProposalRefs(library, item)))
    if (!items.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        `The proposal items do not match the format (run orca task guide --dispatcher): ${items.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`
      )
    }
    const { value, envelope } = await write(
      client,
      'localTasks.proposals.create',
      { paneKey, items: items.data, ...(body.data.summary ? { summary: body.data.summary } : {}) },
      z.object({ proposal: proposalSchema })
    )
    printResult(
      { ...envelope, result: { proposal: value.proposal } },
      json,
      () =>
        `Proposed ${value.proposal.items.length} item(s). The user confirms or dismisses it in Orca; you will hear the outcome in orca task inbox.`
    )
  },
  'task inbox': async ({ client, flags, json }) => {
    const paneKey = dispatcherPane()
    const ack = getOptionalStringFlag(flags, 'ack')
    if (ack) {
      const { envelope } = await write(
        client,
        'localTasks.dispatcher.ack',
        { paneKey, cursor: ack },
        z.object({})
      )
      printResult({ ...envelope, result: { acked: true } }, json, () => 'Inbox acknowledged.')
      return
    }
    const limitText = getOptionalStringFlag(flags, 'limit')
    const limit = limitText ? Number.parseInt(limitText, 10) : undefined
    const { value, envelope } = await callLibrary(
      client,
      'localTasks.dispatcher.inbox',
      { paneKey, ...(limit && limit > 0 ? { limit: Math.min(limit, 100) } : {}) },
      z.union([
        z.object({ ok: z.literal(true), inbox: inboxSchema }),
        z.object({ ok: z.literal(false), code: z.string(), detail: z.string().optional() })
      ])
    )
    if (!value.ok) {
      throw new RuntimeClientError(
        value.code,
        value.detail === 'dispatcher'
          ? 'Orca does not know this pane as the dispatcher. Run this inside the dispatcher session that Orca started.'
          : `The task library refused the read (${value.code}).`
      )
    }
    printResult({ ...envelope, result: { inbox: value.inbox } }, json, formatInbox)
  },
  'task watch': async ({ client, flags, json }) => {
    const paneKey = dispatcherPane()
    const library = await readTaskLibrary(client, { access: 'write' })
    const taskId = taskIdOf(library, getRequiredStringFlag(flags, 'ref'))
    const { envelope } = await write(
      client,
      'localTasks.dispatcher.watch',
      { paneKey, taskId },
      z.object({})
    )
    printResult({ ...envelope, result: { watching: taskId } }, json, () => 'Watching.')
  },
  'task unwatch': async ({ client, flags, json }) => {
    const paneKey = dispatcherPane()
    const library = await readTaskLibrary(client, { access: 'write' })
    const taskId = taskIdOf(library, getRequiredStringFlag(flags, 'ref'))
    const { envelope } = await write(
      client,
      'localTasks.dispatcher.unwatch',
      { paneKey, taskId },
      z.object({})
    )
    printResult({ ...envelope, result: { watching: null } }, json, () => 'Stopped watching.')
  },
  'task needs-you': async ({ client, json }) => {
    const library = await readTaskLibrary(client)
    const { value: snapshot, envelope } = await callLibrary(
      client,
      'localTasks.attention.get',
      {},
      localTaskProgressSnapshotSchema
    )
    const byId = new Map(library.tasks.map((task) => [task.id, task]))
    const sessions = snapshot.items.map((item) => ({
      taskRef: byId.get(item.taskId)?.ref ?? null,
      title: byId.get(item.taskId)?.title ?? null,
      kind: item.kind,
      agent: item.agent,
      lastMessage: item.lastMessage,
      since: item.since
    }))
    const reviewIds = new Set(
      library.projects.flatMap((project) =>
        project.statuses.filter((status) => status.category === 'review').map((status) => status.id)
      )
    )
    const review = library.tasks
      .filter((task) => reviewIds.has(task.statusId))
      .map((task) => ({ taskRef: task.ref, title: task.title }))
    printResult({ ...envelope, result: { sessions, review } }, json, (result) => {
      const lines = [
        ...result.sessions.map(
          (row) =>
            `${row.taskRef ?? '-'}  ${row.title ?? 'A task'}: ${row.agent ?? 'a session'} ${ATTENTION_WORDS[row.kind] ?? 'waits'}${row.lastMessage ? ` — ${row.lastMessage}` : ''}`
        ),
        ...result.review.map((row) => `${row.taskRef}  ${row.title}: waits for the user to review`)
      ]
      return lines.length > 0 ? lines.join('\n') : 'Nothing waits for the user.'
    })
  }
}
