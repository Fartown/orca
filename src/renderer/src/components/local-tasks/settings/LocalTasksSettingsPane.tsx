import { useState } from 'react'
import { FolderKanban, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  isLocalTasksReadable,
  localTasksDomainStore,
  useLocalTasksDomain,
  useWritableLocalTaskEndpoints
} from '@/local-tasks/local-tasks-domain-store'
import { localTaskIdEndpoint } from '@/local-tasks/local-task-endpoints'
import { useLocalTaskEndpointLabels } from '@/local-tasks/local-task-endpoint-labels'
import { LocalTaskHostTag } from '../LocalTaskHostTag'
import {
  LocalTaskHostStatePanel,
  LocalTaskLibraryNotices,
  LocalTaskReadErrorPanel,
  LocalTaskReadOnlyNotice,
  refreshHomeLibrary
} from '../LocalTaskHostStatePanel'
import { LocalTaskProjectCreator } from '../LocalTaskProjectCreator'
import { LocalTaskEmptyProjectForm } from '../LocalTaskEmptyProjectForm'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { LocalTaskProjectSettings } from './LocalTaskProjectSettings'
import { LocalTaskStatusSettings } from './LocalTaskStatusSettings'

function NewProjectDialog({
  open,
  onOpenChange,
  writable
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  writable: boolean
}): React.JSX.Element {
  const [mode, setMode] = useState<'repos' | 'empty'>('repos')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {translate('localTasks.settings.newProject', 'New task project')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'localTasks.settings.newProjectDescription',
              'Make one task project per repository, or an empty one for tasks only; repositories can be added later.'
            )}
          </DialogDescription>
        </DialogHeader>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          onValueChange={(value) => {
            if (value === 'repos' || value === 'empty') {
              setMode(value)
            }
          }}
          className="w-fit"
        >
          <ToggleGroupItem value="repos">
            {translate('localTasks.settings.newFromRepos', 'One per repository')}
          </ToggleGroupItem>
          <ToggleGroupItem value="empty">
            {translate('localTasks.settings.newEmpty', 'Empty project')}
          </ToggleGroupItem>
        </ToggleGroup>
        {mode === 'repos' ? (
          <LocalTaskProjectCreator writable={writable} onDone={() => onOpenChange(false)} />
        ) : (
          <LocalTaskEmptyProjectForm onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Settings → Local Tasks: projects, prefixes and statuses (REQ-001, REQ-002, REQ-003). */
export function LocalTasksSettingsPane(): React.JSX.Element {
  const connection = useLocalTasksDomain((state) => state.connection)
  const readable = useLocalTasksDomain(isLocalTasksReadable)
  const hostState = useLocalTasksDomain((state) => state.hostState)
  const writableEndpoints = useWritableLocalTaskEndpoints()
  const hostLabels = useLocalTaskEndpointLabels()
  const projects = useLocalTasksDomain((state) => state.projects)
  const projectsLoaded = useLocalTasksDomain((state) => state.projectsLoaded)
  const readError = useLocalTasksDomain(
    (state) => state.readErrors.status ?? state.readErrors.projects
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const cachedReadable = projectsLoaded && (hostState === 'ready' || hostState === 'read-only')
  const retryRead = (): void => {
    void refreshHomeLibrary(
      localTasksDomainStore.getState().readErrors.status ? null : ['projects']
    )
  }
  if (connection === 'live' && readError && !cachedReadable) {
    return <LocalTaskReadErrorPanel detail={readError} onRetry={retryRead} />
  }
  if (!readable && !cachedReadable) {
    return <LocalTaskHostStatePanel />
  }
  if (!projectsLoaded) {
    return (
      <div className="text-sm text-muted-foreground">
        {translate('localTasks.page.loading', 'Loading tasks…')}
      </div>
    )
  }
  const project = projects.find((candidate) => candidate.id === selectedId) ?? projects[0]
  // Why per project: each task project is written in its own Orca's library.
  const projectWritable =
    project !== undefined && writableEndpoints.includes(localTaskIdEndpoint(project.id))
  return (
    <div className="flex flex-col gap-6">
      <LocalTaskReadOnlyNotice />
      <LocalTaskLibraryNotices />
      {readError ? (
        <LocalTaskReadErrorPanel detail={readError} onRetry={retryRead} compact />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {projects.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => setSelectedId(candidate.id)}
            aria-pressed={candidate.id === project?.id}
            className={cn(
              'flex h-8 items-center gap-2 rounded-md border px-3 text-[13px] transition',
              candidate.id === project?.id
                ? 'border-foreground/40 bg-muted/70 text-foreground'
                : 'border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <FolderKanban className="size-3.5" />
            {candidate.name}
            <span className="font-mono text-2xs text-muted-foreground">{candidate.prefix}</span>
            <LocalTaskHostTag id={candidate.id} labels={hostLabels} />
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          disabled={writableEndpoints.length === 0}
          onClick={() => setCreating(true)}
        >
          <Plus className="size-3.5" />
          {translate('localTasks.settings.newProject', 'New task project')}
        </Button>
      </div>
      {project ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <LocalTaskProjectSettings key={project.id} project={project} writable={projectWritable} />
          <LocalTaskStatusSettings project={project} writable={projectWritable} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate('localTasks.settings.noProjects', 'No task projects yet.')}
        </p>
      )}
      <NewProjectDialog
        open={creating}
        onOpenChange={setCreating}
        writable={writableEndpoints.length > 0}
      />
    </div>
  )
}
