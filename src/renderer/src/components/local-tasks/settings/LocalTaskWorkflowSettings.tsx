import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import { useLocalTasksDomain, localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'

async function save(key: string, value: string): Promise<void> {
  const domain = localTasksDomainStore.getState()
  const previous = domain.preferences[key] ?? null
  domain.applyHomePreferences({ [key]: value })
  if (!(await runLocalTaskWrite(() => localTasksClient.setPreference(key, value)))) {
    domain.applyHomePreferences({ [key]: previous })
  }
}

export function LocalTaskWorkflowSettings(): React.JSX.Element {
  const preferences = useLocalTasksDomain((state) => state.preferences)
  const writable = useLocalTasksDomain(
    (state) => state.hostState === 'ready' && state.connection === 'live'
  )
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <h3 className="text-sm font-medium">
        {translate('localTasks.workflow.title', 'Task workflow')}
      </h3>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="local-task-startup">
          {translate('localTasks.workflow.startup', 'Open tasks on launch')}
        </Label>
        <Switch
          id="local-task-startup"
          checked={preferences.openTasksOnLaunch !== '0'}
          disabled={!writable}
          onCheckedChange={(checked) => void save('openTasksOnLaunch', checked ? '1' : '0')}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="local-task-brief">
          {translate('localTasks.workflow.brief', 'Include task instructions in new sessions')}
        </Label>
        <Switch
          id="local-task-brief"
          checked={preferences.taskBrief !== '0'}
          disabled={!writable}
          onCheckedChange={(checked) => void save('taskBrief', checked ? '1' : '0')}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Label>{translate('localTasks.workflow.delivery', 'Task prompt delivery')}</Label>
        <ToggleGroup
          type="single"
          value={preferences.sessionSend === 'draft' ? 'draft' : 'submit'}
          disabled={!writable}
          onValueChange={(value) => {
            if (value) {
              void save('sessionSend', value)
            }
          }}
        >
          <ToggleGroupItem value="submit">
            {translate('localTasks.workflow.submit', 'Send immediately')}
          </ToggleGroupItem>
          <ToggleGroupItem value="draft">
            {translate('localTasks.workflow.draft', 'Keep as draft')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </section>
  )
}
