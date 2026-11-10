import { Info } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import type {
  LocalTaskProject,
  LocalTaskProjectRules as Rules
} from '../../../../../shared/local-tasks/local-task-types'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import { LocalTaskSettingsRow, LocalTaskSettingsSegment } from './LocalTaskSettingsControls'

type MergedMode = NonNullable<Rules['prMergedMode']>

async function setRules(project: LocalTaskProject, rules: Partial<Rules>): Promise<void> {
  const result = await runLocalTaskWrite(() =>
    localTasksClient.updateProject({
      projectId: project.id,
      expectedRevision: project.revision,
      rules
    })
  )
  if (result) {
    localTasksDomainStore.getState().upsertProject(result.project)
  }
}

function mergedModeHelp(mode: MergedMode): string {
  switch (mode) {
    case 'review':
      return translate(
        'localTasks.settings.mergedReviewHelp',
        'The task moves to acceptance and shows in Needs you on the task home, where you Approve or Send back.'
      )
    case 'completed':
      return translate(
        'localTasks.settings.mergedCompleteHelp',
        'The task moves straight to completed. Suits projects where a merge ships and nobody needs to check again.'
      )
    case 'none':
      return translate('localTasks.settings.mergedNoneHelp', 'The task’s status stays as it is.')
  }
}

/** The two automatic status rules (REQ-013, REQ-024); both are switched per project. */
export function LocalTaskProjectRules({
  project,
  writable
}: {
  project: LocalTaskProject
  writable: boolean
}): React.JSX.Element {
  // Why: a host from before acceptance existed stores only on/off, so it offers just those two.
  const legacy = project.rules.prMergedMode === undefined
  const mode: MergedMode =
    project.rules.prMergedMode ?? (project.rules.prMergedCompletes ? 'completed' : 'none')
  const mergedTitle = translate(
    'localTasks.settings.mergedAction',
    'After the PR of the task’s workspace is merged'
  )
  const modes: { value: MergedMode; label: string }[] = [
    ...(legacy
      ? []
      : [
          {
            value: 'review' as const,
            label: translate('localTasks.settings.mergedReview', 'Move to acceptance')
          }
        ]),
    {
      value: 'completed',
      label: translate('localTasks.settings.mergedComplete', 'Move to completed')
    },
    { value: 'none', label: translate('localTasks.settings.mergedNone', 'Leave as is') }
  ]
  return (
    <section className="flex min-w-0 flex-col">
      <h3 className="flex flex-wrap items-baseline gap-1.5 text-sm font-semibold">
        {translate('localTasks.settings.rules', 'Automatic status rules')}
        <span className="text-2xs font-normal text-muted-foreground">
          {translate(
            'localTasks.settings.rulesHint',
            '· Only these two, and both can be turned off'
          )}
        </span>
      </h3>
      <div className="divide-y divide-border/60">
        <LocalTaskSettingsRow
          controlId={`local-task-rule-start-${project.id}`}
          title={translate(
            'localTasks.settings.ruleStart',
            'Starting work moves the task to In Progress'
          )}
          description={translate(
            'localTasks.settings.ruleStartHelp',
            'When a workspace or the first session is linked, a Backlog or Todo task moves to the first In Progress status.'
          )}
          control={
            <Switch
              id={`local-task-rule-start-${project.id}`}
              checked={project.rules.startMovesToInProgress}
              disabled={!writable}
              onCheckedChange={(on) => void setRules(project, { startMovesToInProgress: on })}
            />
          }
        />
        <LocalTaskSettingsRow
          stacked
          title={mergedTitle}
          description={mergedModeHelp(mode)}
          control={
            <LocalTaskSettingsSegment
              ariaLabel={mergedTitle}
              value={mode}
              options={modes}
              disabled={!writable}
              onChange={(next) =>
                void setRules(
                  project,
                  legacy ? { prMergedCompletes: next === 'completed' } : { prMergedMode: next }
                )
              }
            />
          }
        />
      </div>
      <p className="flex items-start gap-1.5 text-2xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3 shrink-0" />
        {translate(
          'localTasks.settings.completionNote',
          'Agents move a task at most to acceptance. Only you complete it with Approve, or this rule after the PR is merged.'
        )}
      </p>
    </section>
  )
}
