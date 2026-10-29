import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import type {
  LocalTaskProject,
  LocalTaskProjectRules as Rules
} from '../../../../../shared/local-tasks/local-task-types'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'

async function setRule(project: LocalTaskProject, rule: keyof Rules, on: boolean): Promise<void> {
  const result = await runLocalTaskWrite(() =>
    localTasksClient.updateProject({
      projectId: project.id,
      expectedRevision: project.revision,
      rules: { [rule]: on }
    })
  )
  if (result) {
    localTasksDomainStore.getState().upsertProject(result.project)
  }
}

function RuleRow({
  id,
  label,
  help,
  checked,
  disabled,
  onChange
}: {
  id: string
  label: string
  help: string
  checked: boolean
  disabled: boolean
  onChange: (on: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

/** The two automatic status rules (REQ-013); both default on and are switched per project. */
export function LocalTaskProjectRules({
  project,
  writable
}: {
  project: LocalTaskProject
  writable: boolean
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      <Label>{translate('localTasks.settings.rules', 'Automatic status rules')}</Label>
      <RuleRow
        id={`local-task-rule-start-${project.id}`}
        label={translate(
          'localTasks.settings.ruleStart',
          'Starting work moves the task to In Progress'
        )}
        help={translate(
          'localTasks.settings.ruleStartHelp',
          'When a workspace or the first session is linked, a Backlog or Todo task moves to the first In Progress status.'
        )}
        checked={project.rules.startMovesToInProgress}
        disabled={!writable}
        onChange={(on) => void setRule(project, 'startMovesToInProgress', on)}
      />
      <RuleRow
        id={`local-task-rule-merged-${project.id}`}
        label={translate('localTasks.settings.rulePrMerged', 'A merged PR completes the task')}
        help={translate(
          'localTasks.settings.rulePrMergedHelp',
          'When the PR of the task’s workspace is merged at the workspace’s head, the task moves to the first Done status. Each PR does this once.'
        )}
        checked={project.rules.prMergedCompletes}
        disabled={!writable}
        onChange={(on) => void setRule(project, 'prMergedCompletes', on)}
      />
    </div>
  )
}
