import { useMemo, useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  applyLocalTaskProposalItemDraft,
  localTaskProposalEditFields,
  localTaskProposalPicksProject,
  setLocalTaskProposalItemEdit,
  type LocalTaskProposalItemDraft
} from '@/local-tasks/local-task-proposal-edits'
import type { LocalTaskProposalItemView } from '@/local-tasks/local-task-proposal-item-facts'
import {
  describeLocalTaskProposalItem,
  type LocalTaskProposalNames
} from '@/local-tasks/local-task-proposal-copy'
import type { LocalTaskProposalItemProgress } from '@/local-tasks/local-task-proposal-progress'
import { proposalProjectIsNamed } from '@/local-tasks/local-task-proposal-targets'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import type { LocalTaskProposalItem } from '../../../../shared/local-tasks/local-task-dispatcher-rpc-params'
import { LocalTaskProjectSelect } from './LocalTaskFieldPickers'
import {
  LocalTaskProposalNewSession,
  LocalTaskProposalPlaceChip,
  LocalTaskProposalReview,
  LocalTaskProposalSessionLine
} from './LocalTaskProposalItemMeta'
import {
  LocalTaskProposalItemEditor,
  localTaskProposalDraftOf
} from './LocalTaskProposalItemEditor'
import {
  LocalTaskProposalItemOutcome,
  LocalTaskProposalLockNote,
  LocalTaskProposalStageIcon,
  localTaskProposalStageLabel
} from './LocalTaskProposalItemStatus'

/** Where the item acts and with which session or agent, in the order the prototype reads them. */
function ItemMeta({
  item,
  view
}: {
  item: LocalTaskProposalItem
  view: LocalTaskProposalItemView
}): React.JSX.Element | null {
  const { facts } = view
  const place = facts.place ? (
    <LocalTaskProposalPlaceChip
      place={facts.place}
      hostId={facts.hostId}
      inContact={facts.inContact}
    />
  ) : null
  let parts: React.ReactNode
  switch (item.kind) {
    case 'start':
      parts = (
        <>
          {place}
          <LocalTaskProposalNewSession agent={item.agent ?? null} />
        </>
      )
      break
    case 'subtask':
      parts = (
        <>
          {place}
          <span className="shrink-0">
            {translate('localTasks.dispatcher.place.sameWorkspace', 'Same workspace')}
          </span>
          <LocalTaskProposalNewSession agent={item.agent ?? null} />
        </>
      )
      break
    case 'append':
    case 'stop':
      parts = (
        <>
          {facts.session ? <LocalTaskProposalSessionLine session={facts.session} /> : null}
          {place}
        </>
      )
      break
    case 'link':
    case 'record':
      parts = (
        <>
          {place}
          {facts.hostId ? (
            <LocalTaskProposalReview
              worktreeId={item.target.worktreeId}
              hostId={facts.hostId}
              inContact={facts.inContact}
            />
          ) : null}
        </>
      )
      break
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
      {parts}
    </div>
  )
}

/** The task project a start or record goes in, picked when its repository belongs to several. */
function ProposalProjectPick({
  projectIds,
  value,
  disabled,
  onPick
}: {
  projectIds: readonly string[]
  /** The item's `project`: a name or prefix. */
  value: string | undefined
  disabled: boolean
  onPick: (project: string) => void
}): React.JSX.Element {
  const projects = useLocalTasksDomain((state) => state.projects)
  const candidates = useMemo(
    () => projectIds.flatMap((id) => projects.find((project) => project.id === id) ?? []),
    [projectIds, projects]
  )
  const current = value
    ? candidates.find((project) => proposalProjectIsNamed(project, value))
    : undefined
  return (
    <LocalTaskProjectSelect
      projects={candidates}
      value={current?.id ?? null}
      emptyText={translate('localTasks.dispatcher.pickProject', 'Pick a project')}
      disabled={disabled}
      onChange={(projectId) => {
        const picked = candidates.find((project) => project.id === projectId)
        if (picked) {
          onPick(picked.prefix)
        }
      }}
    />
  )
}

/**
 * One item of a proposal: what it does, where and on which session, and the words it sends. Before
 * confirming it can be kept, dropped or edited; afterwards it shows where it stands (REQ-030).
 */
export function LocalTaskProposalItemRow({
  proposalId,
  index,
  item,
  original,
  names,
  view,
  pending,
  kept,
  busy,
  progress,
  onToggle
}: {
  proposalId: string
  index: number
  /** The item as it will run: the person's edit when there is one. */
  item: LocalTaskProposalItem
  /** The item as the dispatcher wrote it. */
  original: LocalTaskProposalItem
  names: LocalTaskProposalNames
  view: LocalTaskProposalItemView
  pending: boolean
  kept: boolean
  busy: boolean
  progress: LocalTaskProposalItemProgress | null
  onToggle: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<LocalTaskProposalItemDraft | null>(null)
  const copy = describeLocalTaskProposalItem(item, names)
  const lock = pending ? view.lock : null
  const projectLock = lock?.kind === 'project-unpicked'
  const stage = progress?.stage ?? null
  // Why brief: an item that never ran keeps only its title once the proposal is decided.
  const brief = stage === 'dropped' || stage === 'skipped'
  const dimmed = (pending && !kept) || brief
  const editable =
    pending &&
    !busy &&
    (lock === null || projectLock) &&
    localTaskProposalEditFields(item).length > 0
  const editing = editable && draft !== null
  const applied = editing ? applyLocalTaskProposalItemDraft(original, draft) : null
  const picksProject =
    pending &&
    localTaskProposalPicksProject(original) &&
    !original.project &&
    view.facts.projectIds.length > 1
  const storeEdit = (edited: LocalTaskProposalItem): void => {
    const unchanged = JSON.stringify(edited) === JSON.stringify(original)
    setLocalTaskProposalItemEdit(proposalId, index, unchanged ? null : edited)
  }
  const save = (): void => {
    if (!applied) {
      return
    }
    storeEdit(applied)
    setDraft(null)
  }
  const pickProject = (project: string): void => {
    const picked = applyLocalTaskProposalItemDraft(item, { project })
    if (picked) {
      storeEdit(picked)
    }
    if (draft) {
      setDraft({ ...draft, project })
    }
  }
  return (
    <li className="flex min-w-0 gap-2.5 px-3.5 py-2.5">
      <span className="flex size-4 shrink-0 items-center justify-center pt-1">
        {pending ? (
          <Checkbox
            checked={kept}
            onCheckedChange={onToggle}
            disabled={busy || lock !== null}
            aria-label={copy.title}
          />
        ) : stage ? (
          <LocalTaskProposalStageIcon stage={stage} />
        ) : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className={cn('flex min-h-6 min-w-0 items-start gap-2', dimmed && 'opacity-50')}>
          <span
            className={cn(
              'min-w-0 flex-1 break-words text-sm font-medium text-foreground',
              item.kind === 'stop' && 'text-destructive'
            )}
          >
            {copy.title}
          </span>
          {item.kind === 'stop' ? (
            <span className="shrink-0 rounded-sm bg-destructive/15 px-1.5 text-2xs leading-4 text-destructive">
              {translate('localTasks.dispatcher.alwaysConfirm', 'Always confirmed')}
            </span>
          ) : null}
          {editable ? (
            editing ? (
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto"
                disabled={!applied}
                onClick={save}
              >
                <Check />
                {translate('localTasks.dispatcher.editDone', 'Done')}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto text-muted-foreground"
                onClick={() => setDraft(localTaskProposalDraftOf(item))}
              >
                <Pencil />
                {translate('localTasks.dispatcher.edit', 'Edit')}
              </Button>
            )
          ) : null}
          {stage ? (
            <span
              className={cn(
                'ml-auto inline-flex shrink-0 items-center gap-1 text-2xs text-muted-foreground',
                stage === 'done' && 'text-status-success',
                (stage === 'unknown' || stage === 'failed') && 'font-semibold text-status-warning'
              )}
            >
              {localTaskProposalStageLabel(stage)}
            </span>
          ) : null}
        </div>
        {brief ? null : (
          <div className={cn('flex min-w-0 flex-col gap-1', dimmed && 'opacity-50')}>
            <ItemMeta item={item} view={view} />
            {editing && draft ? (
              <LocalTaskProposalItemEditor
                item={original}
                draft={draft}
                onChange={setDraft}
                onSave={save}
                onCancel={() => setDraft(null)}
              />
            ) : copy.detail ? (
              <p className="min-w-0 whitespace-pre-wrap break-words text-xs text-foreground/85">
                {copy.detailLabel ? (
                  <span className="mr-1.5 text-2xs text-muted-foreground">{copy.detailLabel}</span>
                ) : null}
                {copy.detail}
              </p>
            ) : null}
          </div>
        )}
        {picksProject ? (
          <div className={cn('flex min-w-0', dimmed && !projectLock && 'opacity-50')}>
            <ProposalProjectPick
              projectIds={view.facts.projectIds}
              value={localTaskProposalPicksProject(item) ? item.project : undefined}
              disabled={busy}
              onPick={pickProject}
            />
          </div>
        ) : null}
        {lock ? <LocalTaskProposalLockNote lock={lock} hostId={view.facts.hostId} /> : null}
        {progress && !brief ? (
          <LocalTaskProposalItemOutcome progress={progress} names={names} />
        ) : null}
      </div>
    </li>
  )
}
