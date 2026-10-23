import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Ellipsis } from 'lucide-react'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import type { RepoSshGateResolver } from '@/hooks/use-repo-ssh-gate-resolver'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import type { ProjectGroup } from '../../../shared/project-group-types'
import { getRepoHeaderCreateState } from '@/components/sidebar/repo-header-create-state'
import {
  RepoHeaderCreateWorkspaceButton,
  RepoHeaderProjectActionsMenu,
  type RepoHeaderProjectActions
} from '@/components/sidebar/worktree-list/rows/repo-header-project-actions'

type SidebarProjectNameActionsProps = {
  sectionKey: string
  repo: Repo
  label: string
  repoIds?: ReadonlySet<string>
  projectGroups: readonly ProjectGroup[]
  getRepoSshGate: RepoSshGateResolver
  actions: RepoHeaderProjectActions
  createState: ReturnType<typeof getRepoHeaderCreateState> | null
}

function NativeProjectActions(props: SidebarProjectNameActionsProps): React.JSX.Element {
  return (
    <>
      <RepoHeaderProjectActionsMenu
        repo={props.repo}
        label={props.label}
        projectGroups={props.projectGroups}
        actions={props.actions}
      />
      <RepoHeaderCreateWorkspaceButton
        repo={props.repo}
        label={props.label}
        createState={props.createState}
        onCreateForRepo={props.actions.onCreateForRepo}
      />
    </>
  )
}

export function SidebarProjectNameActions(
  props: SidebarProjectNameActionsProps
): React.JSX.Element {
  return props.sectionKey.startsWith('sidebar-name:') ? (
    <NameGroupDirectoryActions {...props} />
  ) : (
    <NativeProjectActions {...props} />
  )
}

function NameGroupDirectoryActions(props: SidebarProjectNameActionsProps): React.JSX.Element {
  const [picker, setPicker] = useState<'settings' | 'create' | null>(null)
  const repoMap = useRepoMap()
  const choices = useMemo(() => {
    const result: Repo[] = []
    for (const id of props.repoIds ?? []) {
      const repo = repoMap.get(id)
      if (repo) {
        result.push(repo)
      }
    }
    return result
  }, [repoMap, props.repoIds])
  const hostLabels = useAppStore(
    useShallow((state) =>
      choices.map((repo) => selectExecutionHostDisplayLabel(state, getRepoExecutionHostId(repo)))
    )
  )
  if (choices.length < 2) {
    return <NativeProjectActions {...props} />
  }
  function closeThen<Args extends unknown[]>(action: (...args: Args) => void) {
    return (...args: Args) => {
      setPicker(null)
      action(...args)
    }
  }
  const actions: RepoHeaderProjectActions = {
    ...props.actions,
    onOpenRepoSettings: closeThen(props.actions.onOpenRepoSettings),
    onOpenWorktreeVisibility: closeThen(props.actions.onOpenWorktreeVisibility),
    onCreateGroupFromRepo: closeThen(props.actions.onCreateGroupFromRepo),
    onMoveProjectToGroup: closeThen(props.actions.onMoveProjectToGroup),
    onRemoveProjectFromGroup: closeThen(props.actions.onRemoveProjectFromGroup),
    onRemoveProject: closeThen(props.actions.onRemoveProject),
    onCreateForRepo: closeThen(props.actions.onCreateForRepo)
  }
  const actionLabel = translate(
    'auto.components.sidebar.WorktreeList.609633a9e6',
    'Project actions for {{value0}}',
    { value0: props.label }
  )
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            data-repo-header-action=""
            aria-label={actionLabel}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              setPicker('settings')
            }}
          >
            <Ellipsis className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{actionLabel}</TooltipContent>
      </Tooltip>
      <RepoHeaderCreateWorkspaceButton
        repo={props.repo}
        label={props.label}
        createState={null}
        onCreateForRepo={() => setPicker('create')}
      />
      <Dialog
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPicker(null)
          }
        }}
      >
        <DialogContent
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>
              {translate('sidebarProjectName.chooseDirectory', 'Choose a directory')}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'sidebarProjectName.directoryDescription',
                'Select the computer and directory for this action.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-sleek">
            {choices.map((repo, index) => {
              const createState = getRepoHeaderCreateState({
                repo,
                label: repo.displayName,
                sshGate: props.getRepoSshGate(repo)
              })
              return (
                <div key={repo.id} className="group flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-w-0 flex-1 justify-start text-left"
                    disabled={picker === 'create' && createState.disabled}
                    onClick={() =>
                      picker === 'create'
                        ? actions.onCreateForRepo(repo.id)
                        : actions.onOpenRepoSettings(repo.id)
                    }
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {hostLabels[index]} · {repo.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {repo.path}
                      </span>
                    </span>
                  </Button>
                  {picker === 'settings' ? (
                    <RepoHeaderProjectActionsMenu
                      repo={repo}
                      label={`${hostLabels[index]} · ${repo.displayName}`}
                      projectGroups={props.projectGroups}
                      actions={actions}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
