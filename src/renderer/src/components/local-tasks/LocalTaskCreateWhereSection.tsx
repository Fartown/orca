import { ArrowRight, Clock, GitBranch, Info, Link2, Plus, type LucideIcon } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import type { LocalTaskCreateWorkspaceChoice } from '@/local-tasks/local-task-create-workspace-choices'
import type { LocalTaskActionState } from '@/local-tasks/local-task-work-actions'
import type { LocalTaskCreateWhereState } from '@/local-tasks/use-local-task-create-where'
import { LocalTaskCreateKickoff } from './LocalTaskCreateKickoff'
import { LocalTaskCreateWorkspaceList } from './LocalTaskCreateWorkspaceList'

export function LocalTaskCreateSectionHeading({
  step,
  children
}: {
  step: number
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <span className="flex size-4 items-center justify-center rounded-full bg-muted text-3xs tabular-nums text-foreground">
        {step}
      </span>
      {children}
    </div>
  )
}

function WhereNote({
  icon: Icon,
  children
}: {
  icon: LucideIcon
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <p className="flex items-start gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-foreground">
      <Icon className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function NewWorkspaceNote({ start }: { start: LocalTaskActionState }): React.JSX.Element {
  if (start.mode === 'existing') {
    return (
      <WhereNote icon={Info}>
        {translate(
          'localTasks.createFlow.newFolder',
          'This project’s repository is a folder, so it can only use an existing workspace.'
        )}
      </WhereNote>
    )
  }
  if (start.reason) {
    return <WhereNote icon={Info}>{start.reason}</WhereNote>
  }
  return (
    <WhereNote icon={ArrowRight}>
      {translate(
        'localTasks.createFlow.newNote',
        'Next, Orca’s new workspace dialog opens; pick the agent and first prompt there. “Start from” has this task selected, and the new workspace is linked to it.'
      )}
    </WhereNote>
  )
}

/**
 * 在哪做 (REQ-027): an existing workspace (pick it and start the session here), a new one (Orca's
 * own dialog comes next) or later. A task made from a running session links that session instead.
 */
export function LocalTaskCreateWhereSection({
  state,
  start,
  onPick,
  record
}: {
  state: LocalTaskCreateWhereState
  /** Whether Start can create a workspace for the project, and why not. */
  start: LocalTaskActionState
  onPick: (choice: LocalTaskCreateWorkspaceChoice) => void
  /** The running session a task is being made from (记成任务). */
  record: { session: string; workspace: string } | null
}): React.JSX.Element {
  const label = translate('localTasks.createFlow.whereSection', 'Where to work')
  return (
    <section className="flex flex-col gap-2.5 border-t border-border/60 pt-4">
      <LocalTaskCreateSectionHeading step={2}>{label}</LocalTaskCreateSectionHeading>
      {record ? (
        <WhereNote icon={Link2}>
          {translate(
            'localTasks.createFlow.recordNote',
            'The {{agent}} session ({{workspace}}) is already running; it is linked to this task instead of opening a new one.',
            { agent: record.session, workspace: record.workspace }
          )}
        </WhereNote>
      ) : (
        <>
          <ToggleGroup
            type="single"
            variant="segmented-card"
            value={state.where}
            onValueChange={(value) => {
              if (value === 'existing' || value === 'new' || value === 'later') {
                state.setWhere(value)
              }
            }}
            aria-label={label}
            className="grid-cols-3"
          >
            <ToggleGroupItem value="existing" className="gap-1.5">
              <GitBranch className="size-3.5" />
              {translate('localTasks.createFlow.whereExisting', 'Existing workspace')}
            </ToggleGroupItem>
            <ToggleGroupItem value="new" className="gap-1.5">
              <Plus className="size-3.5" />
              {translate('localTasks.createFlow.whereNew', 'New workspace')}
            </ToggleGroupItem>
            <ToggleGroupItem value="later" className="gap-1.5">
              <Clock className="size-3.5" />
              {translate('localTasks.createFlow.whereLater', 'Decide later')}
            </ToggleGroupItem>
          </ToggleGroup>
          {state.where === 'existing' ? (
            <>
              <LocalTaskCreateWorkspaceList
                choices={state.choices}
                pickedKey={state.pickedKey}
                onPick={onPick}
                query={state.query}
                onQueryChange={state.setQuery}
              />
              {state.kickoffShown && state.usablePick ? (
                <LocalTaskCreateKickoff
                  workspaceName={state.usablePick.candidate.label}
                  launch={state.launch}
                  agent={state.agent}
                  onAgentChange={state.setAgentChoice}
                  firstLine={state.firstLine}
                  onFirstLineChange={state.setFirstLine}
                  delivery={state.delivery}
                  onDeliveryChange={state.setDeliveryChoice}
                  briefOn={state.briefOn}
                />
              ) : null}
            </>
          ) : state.where === 'new' ? (
            <NewWorkspaceNote start={start} />
          ) : (
            <WhereNote icon={Clock}>
              {translate(
                'localTasks.createFlow.laterNote',
                'Only the task is created; no work starts. Later, use Start in the task view to choose a workspace.'
              )}
            </WhereNote>
          )}
        </>
      )}
    </section>
  )
}
