import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HostListOverflowNote } from '@/components/host-picker/HostListOverflowNote'
import type { useBoundedHostRows } from '@/components/host-picker/use-bounded-host-rows'
import { translate } from '@/i18n/i18n'
import type { LocalTaskDispatchCandidate } from '@/local-tasks/local-task-dispatch-candidates'
import type { LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'

/** What the box dispatches to: a host that narrows the candidates, and the picked targets. */
export function LocalTaskDispatchTargets({
  hostLabel,
  onClearHost,
  rows,
  count,
  onRemove
}: {
  hostLabel: string | null
  onClearHost: () => void
  rows: ReturnType<typeof useBoundedHostRows<LocalTaskDispatchCandidate>>
  count: number
  onRemove: (id: string) => void
}): React.JSX.Element {
  return (
    <>
      {hostLabel || count > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {hostLabel ? (
            <Button size="xs" variant="outline" onClick={onClearHost}>
              {hostLabel}
              <X className="size-3" />
            </Button>
          ) : null}
          {rows.shown.map((target) => (
            <Button
              key={target.id}
              size="xs"
              variant="secondary"
              onClick={() => onRemove(target.id)}
            >
              {target.label}
              <span className="text-muted-foreground">{target.detail}</span>
              <X className="size-3" />
            </Button>
          ))}
          {count > 1 ? (
            <span className="text-2xs text-muted-foreground">
              {translate('localTasks.dispatch.selectedCount', '{{count}} selected', { count })}
            </span>
          ) : null}
        </div>
      ) : null}
      {rows.searchable ? (
        <Input
          value={rows.query}
          onChange={(event) => rows.setQuery(event.target.value)}
          placeholder={translate('localTasks.dispatch.searchSelected', 'Search selected targets')}
          aria-label={translate('localTasks.dispatch.searchSelected', 'Search selected targets')}
          className="h-7"
        />
      ) : null}
      <HostListOverflowNote
        hiddenCount={rows.hiddenCount}
        label={(hidden) =>
          translate('localTasks.dispatch.moreSelected', '{{count}} more selected', {
            count: hidden
          })
        }
      />
    </>
  )
}

/** Which project a dispatch lands in, when the target has several or none yet. */
export function LocalTaskDispatchProjectChoice({
  choices,
  selectedId,
  onPick,
  orphanRepoLabel,
  busy,
  onCreate
}: {
  choices: readonly LocalTaskProject[]
  selectedId: string | null
  onPick: (projectId: string) => void
  orphanRepoLabel: string | null
  busy: boolean
  onCreate: () => void
}): React.JSX.Element | null {
  if (choices.length > 1) {
    return (
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {translate('localTasks.dispatch.project', 'Project')}
        {choices.map((project) => (
          <Button
            key={project.id}
            size="xs"
            variant={selectedId === project.id ? 'secondary' : 'ghost'}
            onClick={() => onPick(project.id)}
          >
            {project.name}
          </Button>
        ))}
      </div>
    )
  }
  if (orphanRepoLabel && selectedId === null) {
    return (
      <div className="flex items-center justify-between gap-2 rounded border border-border p-2 text-xs">
        <span>
          {translate('localTasks.dispatch.createProjectPrompt', 'Create a project for {{repo}}?', {
            repo: orphanRepoLabel
          })}
        </span>
        <Button size="xs" disabled={busy} onClick={onCreate}>
          {translate('localTasks.dispatch.createProject', 'Create project and dispatch')}
        </Button>
      </div>
    )
  }
  return null
}
