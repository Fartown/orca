import { Folder, GitBranch, Search, Unplug } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  localTaskCreateChoiceBlocked,
  type LocalTaskCreateWorkspaceChoice
} from '@/local-tasks/local-task-create-workspace-choices'
import { LocalTaskReviewBadge, useLocalTaskReview } from './LocalTaskProgress'

function matches(choice: LocalTaskCreateWorkspaceChoice, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) {
    return true
  }
  return [
    choice.candidate.label,
    choice.repoLabel,
    choice.branch,
    choice.candidate.detail,
    choice.owner?.ref
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .includes(needle)
}

function ChoiceState({
  choice,
  blocked
}: {
  choice: LocalTaskCreateWorkspaceChoice
  blocked: string | null
}): React.JSX.Element {
  const review = useLocalTaskReview(choice.candidate.worktree)
  if (!choice.candidate.available) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-2xs text-status-warning">
        <Unplug className="size-3" aria-hidden />
        {blocked}
      </span>
    )
  }
  if (blocked) {
    return <span className="shrink-0 text-2xs text-muted-foreground">{blocked}</span>
  }
  if (choice.owner) {
    return (
      <span className="max-w-56 shrink-0 truncate rounded-sm bg-muted px-1.5 text-2xs leading-4 text-foreground">
        {translate('localTasks.createFlow.ownedSubtask', 'Belongs to {{ref}} · becomes a subtask', {
          ref: choice.owner.ref
        })}
      </span>
    )
  }
  if (review) {
    return <LocalTaskReviewBadge review={review} inContact />
  }
  return (
    <span className="shrink-0 text-2xs text-muted-foreground">
      {translate('localTasks.createFlow.free', 'Free')}
    </span>
  )
}

function ChoiceRow({
  choice,
  picked
}: {
  choice: LocalTaskCreateWorkspaceChoice
  picked: boolean
}): React.JSX.Element {
  const blocked = localTaskCreateChoiceBlocked(choice)
  const Icon = choice.folder ? Folder : GitBranch
  const place = [
    choice.folder ? translate('localTasks.createFlow.folder', 'Folder') : choice.repoLabel,
    choice.candidate.detail
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <label
      data-current={picked || undefined}
      className={cn(
        'flex h-8 min-w-0 items-center gap-2 rounded-sm px-2 text-sm',
        blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-accent',
        picked && 'bg-accent'
      )}
    >
      <RadioGroupItem
        value={choice.key}
        disabled={blocked !== null}
        aria-label={choice.candidate.label}
      />
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 shrink truncate">{choice.candidate.label}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{place}</span>
      <ChoiceState choice={choice} blocked={blocked} />
    </label>
  )
}

/** 已有工作区 (REQ-027): search every workspace in the window, pick one to work in. */
export function LocalTaskCreateWorkspaceList({
  choices,
  pickedKey,
  onPick,
  query,
  onQueryChange
}: {
  choices: readonly LocalTaskCreateWorkspaceChoice[]
  pickedKey: string | null
  onPick: (choice: LocalTaskCreateWorkspaceChoice) => void
  query: string
  onQueryChange: (query: string) => void
}): React.JSX.Element {
  const shown = choices.filter((choice) => matches(choice, query))
  const label = translate(
    'localTasks.createFlow.searchPlaceholder',
    'Search workspaces (every host in contact)'
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={label}
          aria-label={label}
          className="h-8 pl-8"
        />
      </div>
      {shown.length === 0 ? (
        <p className="rounded-md border border-border px-3 py-2.5 text-xs text-muted-foreground">
          {choices.length === 0
            ? translate('localTasks.createFlow.noWorkspaces', 'No workspaces yet')
            : translate('localTasks.createFlow.noMatches', 'No matching workspaces')}
        </p>
      ) : (
        <RadioGroup
          value={pickedKey ?? ''}
          onValueChange={(key) => {
            const choice = choices.find((candidate) => candidate.key === key)
            if (choice && localTaskCreateChoiceBlocked(choice) === null) {
              onPick(choice)
            }
          }}
          aria-label={translate('localTasks.createFlow.whereExisting', 'Existing workspace')}
          className="scrollbar-sleek max-h-44 gap-0.5 overflow-y-auto rounded-md border border-border p-1"
        >
          {shown.map((choice) => (
            <ChoiceRow key={choice.key} choice={choice} picked={choice.key === pickedKey} />
          ))}
        </RadioGroup>
      )}
    </div>
  )
}
