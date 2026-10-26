import { ListTodo } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { isLocalTasksWritable, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskProjectCreator } from './LocalTaskProjectCreator'

/** First visit: nothing is created until the user picks projects (REQ-001). */
export function LocalTaskBootstrap(): React.JSX.Element {
  const writable = useLocalTasksDomain(isLocalTasksWritable)
  return (
    <div className="flex flex-1 justify-center overflow-y-auto p-8 scrollbar-sleek">
      <div className="flex w-full max-w-xl flex-col gap-4">
        <div className="flex flex-col gap-2">
          <ListTodo className="size-7 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">
            {translate('localTasks.bootstrap.title', 'Set up local tasks')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {translate(
              'localTasks.bootstrap.description',
              'Tasks are grouped into projects, one per Orca project. Pick the projects you want to track, check their prefixes, and create them. Tasks stay on this computer.'
            )}
          </p>
        </div>
        <LocalTaskProjectCreator writable={writable} />
      </div>
    </div>
  )
}
