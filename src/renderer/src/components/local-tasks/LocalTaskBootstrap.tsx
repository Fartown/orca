import { ListTodo } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useWritableLocalTaskEndpoints } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskProjectCreator } from './LocalTaskProjectCreator'
import { LocalTaskEmptyProjectForm } from './LocalTaskEmptyProjectForm'

/** First visit: nothing is created until the user picks projects or makes an empty one (REQ-001). */
export function LocalTaskBootstrap({
  onStart,
  onDone
}: {
  onStart: () => void
  onDone: () => void
}): React.JSX.Element {
  const writable = useWritableLocalTaskEndpoints().length > 0
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
              'Tasks are grouped into projects. Pick the repositories to track, one project each, check their prefixes and create them; or start an empty project and add repositories later. Each project is kept by the Orca whose repositories it tracks.'
            )}
          </p>
        </div>
        <LocalTaskProjectCreator writable={writable} onStart={onStart} onDone={onDone} />
        <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
          <h3 className="text-sm font-medium text-foreground">
            {translate('localTasks.bootstrap.emptyTitle', 'Or start an empty project')}
          </h3>
          <LocalTaskEmptyProjectForm />
        </div>
      </div>
    </div>
  )
}
