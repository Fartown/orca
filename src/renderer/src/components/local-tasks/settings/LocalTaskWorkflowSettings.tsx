import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import { useLocalTasksDomain, localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import { LocalTaskBriefPreviewDialog } from './LocalTaskBriefPreviewDialog'
import {
  LocalTaskSettingsCard,
  LocalTaskSettingsRow,
  LocalTaskSettingsSegment
} from './LocalTaskSettingsControls'

async function save(key: string, value: string): Promise<void> {
  const domain = localTasksDomainStore.getState()
  const previous = domain.preferences[key] ?? null
  domain.applyHomePreferences({ [key]: value })
  if (!(await runLocalTaskWrite(() => localTasksClient.setPreference(key, value)))) {
    domain.applyHomePreferences({ [key]: previous })
  }
}

/** Task home and dispatch: what Orca opens on, the task brief, and how task sessions send. */
export function LocalTaskWorkflowSettings(): React.JSX.Element {
  const preferences = useLocalTasksDomain((state) => state.preferences)
  const writable = useLocalTasksDomain(
    (state) => state.hostState === 'ready' && state.connection === 'live'
  )
  const [briefOpen, setBriefOpen] = useState(false)
  const launchTitle = translate('localTasks.settings.launchView', 'Show when Orca opens')
  const deliveryTitle = translate('localTasks.settings.delivery', 'Sessions started from a task')
  return (
    <LocalTaskSettingsCard>
      <h3 className="pb-1 text-sm font-semibold">
        {translate('localTasks.settings.homeTitle', 'Task home and dispatch')}
      </h3>
      <div className="divide-y divide-border/60">
        <LocalTaskSettingsRow
          title={launchTitle}
          description={translate(
            'localTasks.settings.launchViewHelp',
            'Task home: the dispatch box, Needs you, and tasks grouped by status. Choose Workspaces to keep Orca as before, with the task page in the left sidebar.'
          )}
          control={
            <LocalTaskSettingsSegment
              ariaLabel={launchTitle}
              value={preferences.openTasksOnLaunch === '0' ? 'workspaces' : 'tasks'}
              disabled={!writable}
              options={[
                {
                  value: 'tasks',
                  label: translate('localTasks.settings.launchTasks', 'Task home')
                },
                {
                  value: 'workspaces',
                  label: translate('localTasks.settings.launchWorkspaces', 'Workspaces')
                }
              ]}
              onChange={(value) => void save('openTasksOnLaunch', value === 'tasks' ? '1' : '0')}
            />
          }
        />
        <LocalTaskSettingsRow
          controlId="local-task-brief"
          title={translate('localTasks.settings.brief', 'Task brief')}
          description={translate(
            'localTasks.settings.briefHelp',
            'Sessions started from a task get a task brief after the first instruction: the task ref, how to write back progress with orca task progress, and that only you complete the task. Turned off, task cards can only show the agent’s last message.'
          )}
          extra={
            <Button
              variant="link"
              size="xs"
              className="h-auto px-0 text-foreground underline decoration-border underline-offset-4 has-[>svg]:px-0"
              onClick={() => setBriefOpen(true)}
            >
              <FileText />
              {translate('localTasks.settings.briefView', 'View the brief')}
            </Button>
          }
          control={
            <Switch
              id="local-task-brief"
              checked={preferences.taskBrief !== '0'}
              disabled={!writable}
              onCheckedChange={(checked) => void save('taskBrief', checked ? '1' : '0')}
            />
          }
        />
        <LocalTaskSettingsRow
          title={deliveryTitle}
          description={translate(
            'localTasks.settings.deliveryHelp',
            'Dispatch, new tasks, new sessions and sessions opened by Send back start this way. This feature’s own popovers can change it each time; Orca’s new workspace dialog follows this setting.'
          )}
          control={
            <LocalTaskSettingsSegment
              ariaLabel={deliveryTitle}
              value={preferences.sessionSend === 'draft' ? 'draft' : 'submit'}
              disabled={!writable}
              options={[
                {
                  value: 'submit',
                  label: translate('localTasks.settings.deliverySend', 'Send now')
                },
                {
                  value: 'draft',
                  label: translate('localTasks.settings.deliveryDraft', 'Put in the input box')
                }
              ]}
              onChange={(value) => void save('sessionSend', value)}
            />
          }
        />
      </div>
      <LocalTaskBriefPreviewDialog open={briefOpen} onOpenChange={setBriefOpen} />
    </LocalTaskSettingsCard>
  )
}
