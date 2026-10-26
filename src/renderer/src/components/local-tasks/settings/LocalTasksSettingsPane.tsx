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
  isLocalTasksWritable,
  useLocalTasksDomain
} from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskHostStatePanel, LocalTaskReadOnlyNotice } from '../LocalTaskHostStatePanel'
import { LocalTaskProjectCreator } from '../LocalTaskProjectCreator'
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
              'Each task project belongs to one Orca project. Pick projects and check their prefixes.'
            )}
          </DialogDescription>
        </DialogHeader>
        <LocalTaskProjectCreator writable={writable} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

/** Settings → Local Tasks: projects, prefixes and statuses (REQ-001, REQ-002, REQ-003). */
export function LocalTasksSettingsPane(): React.JSX.Element {
  const readable = useLocalTasksDomain(isLocalTasksReadable)
  const writable = useLocalTasksDomain(isLocalTasksWritable)
  const projects = useLocalTasksDomain((state) => state.projects)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  if (!readable) {
    return <LocalTaskHostStatePanel />
  }
  const project = projects.find((candidate) => candidate.id === selectedId) ?? projects[0]
  return (
    <div className="flex flex-col gap-6">
      <LocalTaskReadOnlyNotice />
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
          </button>
        ))}
        <Button variant="ghost" size="sm" disabled={!writable} onClick={() => setCreating(true)}>
          <Plus className="size-3.5" />
          {translate('localTasks.settings.newProject', 'New task project')}
        </Button>
      </div>
      {project ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <LocalTaskProjectSettings key={project.id} project={project} writable={writable} />
          <LocalTaskStatusSettings project={project} writable={writable} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate('localTasks.settings.noProjects', 'No task projects yet.')}
        </p>
      )}
      <NewProjectDialog open={creating} onOpenChange={setCreating} writable={writable} />
    </div>
  )
}
