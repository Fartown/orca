import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useSidebarHostScopeOptions } from '@/components/sidebar/use-sidebar-host-scope-options'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getExecutionHostLabel } from '../../../../shared/execution-host'
import { normalizeLocalTaskPrefix } from '../../../../shared/local-tasks/local-task-model'
import { describeLocalTaskFailure } from '@/local-tasks/local-task-failure-copy'
import {
  localTaskEndpointForOrcaProject,
  recommendLocalTaskProjects
} from '@/local-tasks/local-task-project-recommendations'
import { localTaskDefaultStatusNames } from '@/local-tasks/local-task-vocabulary-copy'
import { orcaProjectHostIds } from '@/local-tasks/local-task-workspace-resolution'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import {
  isLocalTasksWritable,
  localTasksDomainStore,
  useLocalTasksDomain
} from '@/local-tasks/local-tasks-domain-store'

type RowState = { selected: boolean; prefix: string; error: string | null }

function useHostLabelsByProject(): Map<string, string[]> {
  const setups = useAppStore((state) => state.projectHostSetups)
  const { hostOptions } = useSidebarHostScopeOptions()
  return useMemo(() => {
    const labelById = new Map(hostOptions.map((host) => [host.id, host.label]))
    const byProject = new Map<string, string[]>()
    for (const setup of setups) {
      const label = labelById.get(setup.hostId) ?? getExecutionHostLabel(setup.hostId)
      const labels = byProject.get(setup.projectId) ?? []
      if (!labels.includes(label)) {
        labels.push(label)
      }
      byProject.set(setup.projectId, labels)
    }
    return byProject
  }, [setups, hostOptions])
}

/**
 * Suggests one task project per Orca project (local and SSH alike) and creates only the rows the
 * user ticks (REQ-001). Prefixes are editable; conflicts come back per row.
 */
export function LocalTaskProjectCreator({
  onStart,
  onDone,
  writable
}: {
  onStart?: () => void
  onDone?: () => void
  writable: boolean
}): React.JSX.Element {
  const orcaProjects = useAppStore((state) => state.projects)
  const taskProjects = useLocalTasksDomain((state) => state.projects)
  const hostLabels = useHostLabelsByProject()
  const recommendations = useMemo(
    () => recommendLocalTaskProjects(orcaProjects, taskProjects),
    [orcaProjects, taskProjects]
  )
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [busy, setBusy] = useState(false)
  const [createdCount, setCreatedCount] = useState(0)
  const rowOf = (projectId: string, prefix: string): RowState =>
    rows[projectId] ?? { selected: false, prefix, error: null }
  const patchRow = (projectId: string, prefix: string, patch: Partial<RowState>): void =>
    setRows((current) => ({
      ...current,
      [projectId]: { ...(current[projectId] ?? { selected: false, prefix, error: null }), ...patch }
    }))
  const chosen = recommendations.filter(({ project, prefix }) => rowOf(project.id, prefix).selected)

  const create = async (): Promise<void> => {
    onStart?.()
    setBusy(true)
    const statusNames = localTaskDefaultStatusNames()
    let failed = false
    for (const { project, prefix: suggested } of chosen) {
      const prefix = normalizeLocalTaskPrefix(rowOf(project.id, suggested).prefix)
      if (!prefix) {
        failed = true
        patchRow(project.id, suggested, {
          error: describeLocalTaskFailure({ ok: false, code: 'prefix_invalid' })
        })
        continue
      }
      const endpoint = localTaskEndpointForOrcaProject(
        orcaProjectHostIds(useAppStore.getState(), project.id),
        (candidate) => isLocalTasksWritable(localTasksDomainStore.getState(), candidate)
      )
      if (!endpoint) {
        failed = true
        patchRow(project.id, suggested, {
          error: translate(
            'localTasks.projects.noLibrary',
            'None of this project’s hosts has a task library that is connected and writable.'
          )
        })
        continue
      }
      try {
        const result = await localTasksClient.createProject(endpoint, {
          name: project.displayName,
          prefix,
          repos: [project.id],
          statusNames
        })
        if (result.ok) {
          setCreatedCount((count) => count + 1)
          localTasksDomainStore.getState().upsertProject(result.project)
        } else {
          failed = true
          patchRow(project.id, suggested, { error: describeLocalTaskFailure(result) })
        }
      } catch (error) {
        failed = true
        patchRow(project.id, suggested, {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    setBusy(false)
    if (!failed) {
      onDone?.()
    }
  }

  if (recommendations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {orcaProjects.length === 0
          ? translate(
              'localTasks.projects.noOrcaProjects',
              'No repositories in Orca yet. Make an empty project, or add a repository to Orca first.'
            )
          : translate(
              'localTasks.projects.allLinked',
              'Every repository already has a task project. More projects can share one from settings.'
            )}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border/60 rounded-md border border-border/60">
        {recommendations.map(({ project, prefix: suggested }) => {
          const row = rowOf(project.id, suggested)
          return (
            <li key={project.id} className="flex flex-col gap-1 px-3 py-2">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={row.selected}
                  disabled={!writable || busy}
                  onCheckedChange={(checked) =>
                    patchRow(project.id, suggested, { selected: checked === true, error: null })
                  }
                  aria-label={project.displayName}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-foreground">{project.displayName}</span>
                  <span className="truncate text-2xs text-muted-foreground">
                    {(hostLabels.get(project.id) ?? []).join(' · ')}
                  </span>
                </div>
                <Input
                  value={row.prefix}
                  disabled={!writable || busy}
                  maxLength={10}
                  onChange={(event) =>
                    patchRow(project.id, suggested, {
                      prefix: event.target.value.toUpperCase(),
                      error: null
                    })
                  }
                  aria-label={translate('localTasks.projects.prefixFor', 'Prefix for {{name}}', {
                    name: project.displayName
                  })}
                  aria-invalid={row.error !== null || undefined}
                  className="h-8 w-24"
                />
              </div>
              {row.error ? <p className="pl-7 text-xs text-destructive">{row.error}</p> : null}
            </li>
          )
        })}
      </ul>
      <div className="flex justify-end">
        {createdCount > 0 ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onDone}>
            {translate('localTasks.projects.continue', 'Continue with created projects')}
          </Button>
        ) : null}
        <Button
          size="sm"
          disabled={!writable || busy || chosen.length === 0}
          onClick={() => void create()}
        >
          {translate('localTasks.projects.create', 'Create selected ({{count}})', {
            count: chosen.length
          })}
        </Button>
      </div>
    </div>
  )
}
