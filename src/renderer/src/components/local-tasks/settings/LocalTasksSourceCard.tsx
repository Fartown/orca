import { ListTodo } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TaskSourceProviderCard } from '@/components/settings/TaskSourceProviderCard'
import { TaskSourceShowInTasksStep } from '@/components/settings/TaskSourceShowInTasksStep'
import { TaskSourceStepRow } from '@/components/settings/TaskSourceStepRow'
import type { TaskProviderReadiness } from '@/components/settings/task-source-setup-state'
import { translate } from '@/i18n/i18n'
import { openLocalTasksSettings } from '@/local-tasks/local-task-navigation'
import {
  chooseLocalTaskSourceVisible,
  useLocalTaskSourceVisible
} from '@/local-tasks/local-task-source-visibility'
import {
  selectLocalTasksPartition,
  useLocalTasksDomain
} from '@/local-tasks/local-tasks-domain-store'

function useLocalTasksReadiness(visible: boolean): TaskProviderReadiness {
  const hostState = useLocalTasksDomain(
    (state) => selectLocalTasksPartition(state, state.home)?.hostState ?? null
  )
  const hasLibrary = useLocalTasksDomain((state) => state.home !== null)
  return {
    connected: hostState === 'ready' || hostState === 'read-only',
    checking: hasLibrary && (hostState === null || hostState === 'starting'),
    unavailable: !hasLibrary || hostState === 'unavailable' || hostState === 'not-task-host',
    visible
  }
}

/**
 * Local tasks in Settings → Task sources (REQ-008), shown or hidden like an upstream provider.
 * Its first step is the library itself; there is nothing to connect. Upstream's "keep one
 * provider shown" rule only weighs upstream providers, so Local can always be hidden.
 */
export function LocalTasksSourceCard(): React.JSX.Element {
  const visible = useLocalTaskSourceVisible()
  const readiness = useLocalTasksReadiness(visible)
  const projectCount = useLocalTasksDomain((state) => state.projects.length)
  const name = translate('localTasks.source.label', 'Local tasks')
  const toggle = (): void => {
    void chooseLocalTaskSourceVisible(!visible).catch(() => {
      toast.error(
        translate(
          'localTasks.source.visibilityFailed',
          'Could not save whether Local tasks are shown.'
        )
      )
    })
  }
  return (
    <TaskSourceProviderCard
      icon={<ListTodo className="size-4" />}
      name={name}
      description={translate(
        'localTasks.source.settingsDescription',
        'Tasks you write down in Orca, kept by each Orca for its own machine. Nothing to connect.'
      )}
      readiness={readiness}
      visible={visible}
      canHide
      defaultExpanded={false}
      onToggleVisible={toggle}
    >
      <ol className="divide-y divide-border/50">
        <TaskSourceStepRow
          index={1}
          state={readiness.checking ? 'in-progress' : projectCount > 0 ? 'done' : 'pending'}
          title={translate('localTasks.source.projectsStepTitle', 'Projects and statuses')}
          description={
            projectCount > 0
              ? translate(
                  'localTasks.source.projectsStepCount',
                  'Projects: {{count}}. Statuses, repositories and rules are set per project.',
                  { count: projectCount }
                )
              : translate(
                  'localTasks.source.projectsStepEmpty',
                  'Create a project to start writing down tasks; it can link Orca repositories.'
                )
          }
          action={
            <Button
              type="button"
              size="sm"
              variant={projectCount > 0 ? 'outline' : 'default'}
              onClick={openLocalTasksSettings}
            >
              {translate('localTasks.nav.manageProjects', 'Manage projects and statuses')}
            </Button>
          }
        />
        <TaskSourceShowInTasksStep
          index={2}
          providerLabel={name}
          visible={visible}
          canHide
          onToggleVisible={toggle}
        />
      </ol>
    </TaskSourceProviderCard>
  )
}
