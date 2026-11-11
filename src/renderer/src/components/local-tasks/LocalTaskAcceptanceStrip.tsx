import { useState } from 'react'
import { Check, GitBranch, Send, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { firstStatusInCategory } from '@/local-tasks/local-task-grouping'
import { updateLocalTaskFields, runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { localTasksDomainStore, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { sendLocalTaskReply } from '@/local-tasks/local-task-needs-you-actions'
import {
  isLocalTaskHostInContact,
  useLocalTaskHostInContact
} from '@/local-tasks/local-task-host-contact'
import { useAppStore } from '@/store'
import { runLocalTaskStart } from '@/local-tasks/local-task-work-actions'
import { localTaskLinkDialogStore } from '@/local-tasks/local-task-link-dialog-store'
import { localTaskPromptFor } from '@/local-tasks/local-task-session-launch'
import { findLocalTaskEffectiveWorkspace } from '@/local-tasks/local-task-link-selectors'
import { localTaskEventActor } from '@/local-tasks/local-task-event-copy'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { parseLocalTaskProgressSections } from '@/local-tasks/local-task-progress-sections'
import {
  localTaskWritebackSection,
  type LocalTaskWriteback
} from '@/local-tasks/local-task-writebacks'
import { localTaskSessionPanelStore } from '@/local-tasks/local-task-session-panel-store'
import { localTaskBranchName } from '@/local-tasks/local-task-workspace-linking'
import { localTaskEventText } from '../../../../shared/local-tasks/local-task-event-payload'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { LocalTaskWorkspaceLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskDiffStat, LocalTaskFactRow, LocalTaskFactRows } from './LocalTaskFactRows'
import { useLocalTaskHostLabel } from './LocalTaskHostLabel'
import { openLocalTaskWorkspaceChanges } from './LocalTaskWorkspaceCard'
import { useLocalTaskWorkspaceDiff } from './use-local-task-workspace-diff'
import {
  LocalTaskReviewBadge,
  localTaskReviewStateLabel,
  useLocalTaskReview,
  useLocalTaskWorkspace,
  useLocalTaskWorkspaceHostId
} from './LocalTaskProgress'

const DETAIL_ID = 'local-task-detail-acceptance'

/** The title row's Review: brings the acceptance block into view with Approve focused. */
export function focusLocalTaskAcceptance(): void {
  const block = document.getElementById(DETAIL_ID)
  block?.scrollIntoView({ block: 'nearest' })
  block?.querySelector<HTMLButtonElement>('[data-acceptance-approve]')?.focus()
}

/** Why the task waits for acceptance: the newest status change into its current status. */
function EntryReason({ task }: { task: LocalTask }): React.JSX.Element | null {
  const events = useLocalTasksDomain((state) => state.eventsByTaskId[task.id])
  const now = useNow(60_000)
  const entry = events?.findLast(
    (event) => event.kind === 'status' && localTaskEventText(event.payload, 'to') === task.statusId
  )
  if (!entry) {
    return null
  }
  const prNumber = entry.payload?.prNumber
  const why =
    localTaskEventText(entry.payload, 'rule') === 'pr-merged'
      ? translate('localTasks.acceptance.reasonPrMerged', 'Moved here after #{{number}} merged', {
          number: typeof prNumber === 'number' ? prNumber : '?'
        })
      : translate('localTasks.acceptance.reasonBy', '{{actor}} moved it here', {
          actor: localTaskEventActor(entry.source)
        })
  return (
    <span className="min-w-0 truncate text-xs text-muted-foreground">
      {why} · {formatLocalTaskTime(entry.createdAt, now)}
    </span>
  )
}

/**
 * What the reviewer reads before Approve or Send back: where the work landed, what changed, and the
 * agent's own self-check and where to verify from its latest writeback. Only rows with data show.
 */
function AcceptanceFacts({
  workspace,
  latest
}: {
  workspace: LocalTaskWorkspaceLink | null
  latest: LocalTaskWriteback | null
}): React.JSX.Element | null {
  const located = useLocalTaskWorkspace(workspace)
  const worktree = located !== null && typeof located !== 'string' ? located : null
  const hostId = useLocalTaskWorkspaceHostId(worktree) ?? workspace?.hostId ?? null
  const inContact = useLocalTaskHostInContact(hostId)
  const hostLabel = useLocalTaskHostLabel(hostId, workspace?.hostLabelSnapshot ?? null)
  const review = useLocalTaskReview(worktree)
  const diff = useLocalTaskWorkspaceDiff(worktree?.id ?? null)
  const session = useLocalTasksDomain((state) =>
    latest?.sessionLinkId
      ? state.links.sessions.find((candidate) => candidate.id === latest.sessionLinkId)
      : undefined
  )
  const sessionInContact = useLocalTaskHostInContact(session?.hostId ?? null)
  const now = useNow(60_000)
  const sections = latest ? parseLocalTaskProgressSections(latest.event.body ?? '') : null
  const selfCheck = localTaskWritebackSection(sections, 'selfCheck')
  const verify = localTaskWritebackSection(sections, 'verify')
  const branch = (worktree ? localTaskBranchName(worktree) : null) ?? workspace?.branchSnapshot
  const base = review && 'baseRefName' in review ? review.baseRefName : undefined
  const host = inContact
    ? hostLabel
    : `${hostLabel} ${translate('localTasks.links.notConnected', '(not connected)')}`
  const place = [branch && base ? `${branch} → ${base}` : branch, host].filter(Boolean).join(' · ')
  if (!workspace && !diff && !selfCheck && !verify) {
    return null
  }
  const agentId = session?.agent
  const agent = isTuiAgent(agentId) ? agentId : null
  const source = latest
    ? [
        agent ? getAgentLabel(agent) : null,
        translate('localTasks.now.writebackNumber', 'Write-back #{{number}}', {
          number: latest.number
        }),
        formatLocalTaskTime(latest.event.createdAt, now)
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  return (
    <LocalTaskFactRows>
      {workspace ? (
        <LocalTaskFactRow label={translate('localTasks.acceptance.landed', 'Landed in')}>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            {review ? (
              <span className="flex items-center gap-1 font-medium">
                <LocalTaskReviewBadge review={review} inContact={inContact} />
                {inContact ? localTaskReviewStateLabel(review) : null}
              </span>
            ) : (
              <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 truncate text-xs text-muted-foreground">{place}</span>
          </span>
        </LocalTaskFactRow>
      ) : null}
      {diff ? (
        <LocalTaskFactRow label={translate('localTasks.acceptance.changes', 'Changes')}>
          <span className="flex flex-wrap items-center gap-2">
            <LocalTaskDiffStat diff={diff} />
            {worktree && inContact && workspace?.kind === 'git-worktree' ? (
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => openLocalTaskWorkspaceChanges(worktree, hostId)}
              >
                {translate('localTasks.links.viewChanges', 'View changes')}
              </button>
            ) : null}
          </span>
        </LocalTaskFactRow>
      ) : null}
      {selfCheck ? (
        <LocalTaskFactRow label={translate('localTasks.acceptance.selfCheck', 'Self-check')}>
          <span className="whitespace-pre-wrap">
            {agent ? <AgentIcon agent={agent} size={12} className="mr-1 inline" /> : null}
            {selfCheck}
          </span>{' '}
          {session && sessionInContact ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => localTaskSessionPanelStore.getState().open(session)}
            >
              {source}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">{source}</span>
          )}
        </LocalTaskFactRow>
      ) : null}
      {verify ? (
        <LocalTaskFactRow
          label={translate('localTasks.acceptance.whereToVerify', 'Where to verify')}
        >
          <span className="whitespace-pre-wrap">{verify}</span>
        </LocalTaskFactRow>
      ) : null}
    </LocalTaskFactRows>
  )
}

const NO_WRITEBACKS: readonly LocalTaskWriteback[] = []

/**
 * Approve or Send back a task waiting for acceptance. `queue` is the bare strip for a list card;
 * `detail` is the task view's block with the facts to judge by.
 */
export function LocalTaskAcceptanceStrip({
  task,
  project,
  writable,
  variant = 'queue',
  workspace = null,
  writebacks = NO_WRITEBACKS
}: {
  task: LocalTask
  project: LocalTaskProject | undefined
  writable: boolean
  variant?: 'queue' | 'detail'
  /** The workspace the task works in, its own or an ancestor's. */
  workspace?: LocalTaskWorkspaceLink | null
  writebacks?: readonly LocalTaskWriteback[]
}): React.JSX.Element | null {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  // Why only finished sessions: one working or waiting cannot take the reason as its next line.
  const finishedSessions = useLocalTasksDomain(
    (state) =>
      state.links.sessions.filter(
        (session) =>
          session.taskId === task.id && state.progress?.sessions.get(session.id)?.state === 'done'
      ).length
  )
  const status = project?.statuses.find((candidate) => candidate.id === task.statusId)
  if (!project || status?.category !== 'review') {
    return null
  }
  const completed = firstStatusInCategory(project, 'completed')
  const started = firstStatusInCategory(project, 'started')
  const reject = async (): Promise<void> => {
    if (!started || !reason.trim() || busy) {
      return
    }
    setBusy(true)
    try {
      const comment = await runLocalTaskWrite(() =>
        localTasksClient.addComment(task.id, reason.trim())
      )
      if (!comment) {
        return
      }
      const result = await updateLocalTaskFields(task, { statusId: started.id })
      if (result === false) {
        return
      }
      const domain = localTasksDomainStore.getState()
      const sessions = domain.links.sessions.filter(
        (session) =>
          session.taskId === task.id && domain.progress?.sessions.get(session.id)?.state === 'done'
      )
      let unsent = false
      for (const session of sessions) {
        if (!isLocalTaskHostInContact(useAppStore.getState(), session.hostId)) {
          unsent = true
          continue
        }
        if ((await sendLocalTaskReply(session, reason.trim())).status !== 'sent') {
          unsent = true
        }
      }
      if (sessions.length === 0) {
        const effective = findLocalTaskEffectiveWorkspace(
          domain.links,
          task,
          new Map(domain.tasks.map((candidate) => [candidate.id, candidate]))
        )
        if (effective) {
          localTaskLinkDialogStore.getState().open({
            kind: 'session',
            taskId: task.id,
            prompt: `${reason.trim()}\n\n${localTaskPromptFor(task)}`
          })
        } else {
          runLocalTaskStart(task, project, null, {
            prompt: `${reason.trim()}\n\n${localTaskPromptFor(task)}`
          })
        }
      }
      if (unsent) {
        toast.info(
          translate('localTasks.acceptance.notSent', 'Feedback saved. Open the session to send it.')
        )
      }
      setRejecting(false)
      setReason('')
    } finally {
      setBusy(false)
    }
  }
  const approve = async (): Promise<void> => {
    if (!completed) {
      return
    }
    setBusy(true)
    try {
      await updateLocalTaskFields(task, { statusId: completed.id })
    } finally {
      setBusy(false)
    }
  }
  const detail = variant === 'detail'
  const actions = (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-expanded={rejecting}
        disabled={!writable || busy || !started}
        onClick={() => setRejecting(!rejecting)}
      >
        <Undo2 className="size-3.5" />
        {translate('localTasks.acceptance.reject', 'Send back')}
      </Button>
      <Button
        size="sm"
        data-acceptance-approve
        disabled={!writable || busy || !completed}
        onClick={() => void approve()}
      >
        <Check className="size-3.5" />
        {detail
          ? translate('localTasks.acceptance.approve', 'Approve')
          : translate('localTasks.acceptance.accept', 'Accept')}
      </Button>
    </>
  )
  const editor = rejecting ? (
    <div className="flex flex-col gap-2">
      {detail ? (
        <span className="flex items-baseline gap-1.5 text-xs font-medium text-foreground">
          {translate('localTasks.acceptance.rejectReason', 'Reason to send back')}
          <span className="font-normal text-muted-foreground">
            {translate('localTasks.acceptance.required', 'required')}
          </span>
        </span>
      ) : null}
      <Textarea
        autoFocus
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={busy}
        aria-label={translate('localTasks.acceptance.reason', 'What needs to change?')}
        placeholder={translate('localTasks.acceptance.reason', 'What needs to change?')}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRejecting(false)}>
          {translate('localTasks.common.cancel', 'Cancel')}
        </Button>
        <Button size="sm" disabled={!reason.trim() || busy} onClick={() => void reject()}>
          <Send className="size-3.5" />
          {finishedSessions > 0
            ? translate('localTasks.acceptance.sendBackToSessions', 'Send back to the sessions')
            : translate('localTasks.acceptance.sendBackNewSession', 'Send back in a new session')}
        </Button>
      </div>
    </div>
  ) : null
  if (!detail) {
    return (
      <div className="flex flex-col gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm font-medium">
            {translate('localTasks.acceptance.title', 'Ready for acceptance')}
          </span>
          {actions}
        </div>
        {editor}
      </div>
    )
  }
  return (
    <div
      id={DETAIL_ID}
      className="flex flex-col gap-3 rounded-lg border border-status-success-border p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <LocalTaskStatusIcon category="review" color={status.color} />
        <span className="text-sm font-semibold text-foreground">
          {translate('localTasks.acceptance.title', 'Ready for acceptance')}
        </span>
        <EntryReason task={task} />
        <span className="ml-auto flex shrink-0 items-center gap-2">{actions}</span>
      </div>
      <AcceptanceFacts workspace={workspace} latest={writebacks.at(-1) ?? null} />
      {editor}
    </div>
  )
}
