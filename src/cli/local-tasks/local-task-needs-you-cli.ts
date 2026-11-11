import { localTaskProgressSnapshotSchema } from '../../shared/local-tasks/local-task-link-read-schemas'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { quotedCliText } from './local-task-cli-format'
import { callLibrary, readTaskLibrary, type TaskLibrary } from './local-task-cli-library'

const ATTENTION_WORDS: Record<string, string> = {
  approval: 'waits to approve',
  question: 'waits for an answer',
  blocked: 'is blocked',
  'unread-done': 'finished a round, unread'
}

type NeedsYouRow = {
  taskRef: string | null
  title: string | null
  kind: string
  agent: string | null
  lastMessage: string | null
  since: number
}

/** A host out of contact: its sessions may still wait on the user, but nothing here can say. */
type UnverifiableHost = {
  hostId: string
  host: string
  sessions: { taskRef: string | null; title: string | null; agent: string | null }[]
}

type NeedsYouResult = {
  sessions: NeedsYouRow[]
  review: { taskRef: string; title: string }[]
  unverifiable: UnverifiableHost[]
}

function hostLabel(library: TaskLibrary, hostId: string): string {
  return (
    library.links.workspaces.find((link) => link.hostId === hostId && link.hostLabelSnapshot)
      ?.hostLabelSnapshot ?? hostId
  )
}

/** Sessions Orca cannot confirm, by host; that is never read as "nothing waits" nor as "host gone". */
function unverifiableHosts(
  library: TaskLibrary,
  unverifiableSessionIds: ReadonlySet<string>
): UnverifiableHost[] {
  const byHost = new Map<string, UnverifiableHost>()
  for (const link of library.links.sessions) {
    if (!unverifiableSessionIds.has(link.id)) {
      continue
    }
    const task = library.tasks.find((candidate) => candidate.id === link.taskId)
    const host = byHost.get(link.hostId) ?? {
      hostId: link.hostId,
      host: hostLabel(library, link.hostId),
      sessions: []
    }
    host.sessions.push({
      taskRef: task?.ref ?? null,
      title: task?.title ?? null,
      agent: link.agent
    })
    byHost.set(link.hostId, host)
  }
  return [...byHost.values()]
}

function formatNeedsYou(result: NeedsYouResult): string {
  const lines = [
    ...result.sessions.map(
      (row) =>
        `${row.taskRef ?? '-'}  ${row.title ? quotedCliText(row.title) : 'A task'}: ${row.agent ?? 'a session'} ${ATTENTION_WORDS[row.kind] ?? 'waits'}${row.lastMessage ? ` — ${quotedCliText(row.lastMessage)}` : ''}`
    ),
    ...result.review.map(
      (row) => `${row.taskRef}  ${quotedCliText(row.title)}: waits for the user to review`
    )
  ]
  const offline = result.unverifiable.flatMap((host) => [
    `On ${host.host}, these sessions can't be confirmed (unverifiable): the host is out of contact or they have not reported for a while.`,
    ...host.sessions.map(
      (session) =>
        `  ${session.taskRef ?? '-'}  ${session.title ? quotedCliText(session.title) : 'A task'} (${session.agent ?? 'a session'})`
    )
  ])
  if (lines.length === 0) {
    lines.push(
      offline.length > 0
        ? 'Nothing waits for the user among the sessions Orca can confirm.'
        : 'Nothing waits for the user.'
    )
  }
  return [...lines, ...offline].join('\n')
}

export const LOCAL_TASK_NEEDS_YOU_CLI_HANDLERS: Record<string, CommandHandler> = {
  'task needs-you': async ({ client, json }) => {
    const library = await readTaskLibrary(client, { links: true })
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
    const unverifiable = unverifiableHosts(
      library,
      new Set(
        snapshot.sessions
          .filter((session) => session.state === 'unverifiable')
          .map((session) => session.taskSessionId)
      )
    )
    printResult({ ...envelope, result: { sessions, review, unverifiable } }, json, formatNeedsYou)
  }
}
