import { folderWorkspaceToWorktree } from '../../../../shared/folder-workspace-worktree'
import { useMemo } from 'react'
import { basename } from '@/lib/path'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useAllWorktrees } from '@/store/selectors'
import { listGoalSessionCandidates, type GoalSessionCandidate } from '@/goals/goal-session-target'

export type GoalTargetSelection = {
  worktreeId: string | null
  paneKey: string | null
}

/**
 * Workspace + session. Sessions are the hook-backed agent rows of that workspace,
 * never guessed from a cwd or a title; a pane-scoped entry locks both.
 */
export function GoalTargetPicker({
  value,
  locked,
  lockWorkspace = false,
  onChange
}: {
  value: GoalTargetSelection
  locked: boolean
  /** Keep the workspace fixed while still letting the session change (rebind). */
  lockWorkspace?: boolean
  onChange: (next: GoalTargetSelection) => void
}): React.JSX.Element {
  const worktrees = useAllWorktrees()
  const folderWorkspaces = useAppStore((s) => s.folderWorkspaces)
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const localWorktrees = useMemo(
    () =>
      [...worktrees, ...folderWorkspaces.map(folderWorkspaceToWorktree)]
        .filter((worktree) => !worktree.hostId || worktree.hostId === 'local')
        .sort((a, b) => a.path.localeCompare(b.path)),
    [worktrees, folderWorkspaces]
  )
  const candidates = useMemo(
    () =>
      value.worktreeId ? listGoalSessionCandidates(agentStatusByPaneKey, value.worktreeId) : [],
    [agentStatusByPaneKey, value.worktreeId]
  )
  const lockedCandidate = locked
    ? candidates.find((candidate) => candidate.paneKey === value.paneKey)
    : undefined

  return (
    <div className="grid min-w-0 gap-3">
      <div className="min-w-0 space-y-1">
        <Label htmlFor="goal-workspace">{translate('goals.editor.workspace', 'Workspace')}</Label>
        <Select
          value={value.worktreeId ?? ''}
          disabled={locked || lockWorkspace}
          onValueChange={(worktreeId) => onChange({ worktreeId, paneKey: null })}
        >
          <SelectTrigger id="goal-workspace" className="w-full min-w-0">
            <SelectValue
              className="min-w-0 flex-1"
              placeholder={translate('goals.editor.pickWorkspace', 'Pick a workspace')}
            />
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="start"
            className="w-(--radix-select-trigger-width) max-w-(--radix-select-content-available-width)"
          >
            {localWorktrees.map((worktree) => (
              <SelectItem key={worktree.id} value={worktree.id} className="*:min-w-0">
                <span className="min-w-0 truncate" title={worktree.path}>
                  {worktree.displayName || basename(worktree.path)}
                  <span className="ml-1 text-muted-foreground">{worktree.path}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {translate('goals.editor.executionLocal', 'Runs on this machine.')}
        </p>
      </div>
      <div className="min-w-0 space-y-1">
        <Label htmlFor="goal-session">{translate('goals.editor.session', 'Agent session')}</Label>
        <Select
          value={value.paneKey ?? ''}
          disabled={locked || !value.worktreeId}
          onValueChange={(paneKey) => onChange({ worktreeId: value.worktreeId, paneKey })}
        >
          <SelectTrigger id="goal-session" className="w-full min-w-0">
            <SelectValue
              className="min-w-0 flex-1"
              placeholder={translate('goals.editor.pickSession', 'Pick a running agent session')}
            />
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="start"
            className="w-(--radix-select-trigger-width) max-w-(--radix-select-content-available-width)"
          >
            {(lockedCandidate ? [lockedCandidate] : candidates).map((candidate) => (
              <SelectItem key={candidate.paneKey} value={candidate.paneKey} className="*:min-w-0">
                <span className="min-w-0 truncate">{candidateLabel(candidate)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {value.worktreeId && candidates.length === 0 && !locked
            ? translate(
                'goals.editor.noSessions',
                'You can draft the document now. Start and select an agent session before execution.'
              )
            : translate(
                'goals.editor.sessionHint',
                'Select an agent session before execution. Document generation only needs the workspace.'
              )}
        </p>
      </div>
    </div>
  )
}

function candidateLabel(candidate: GoalSessionCandidate): string {
  const agent = candidate.agentType ?? translate('goals.editor.unknownAgent', 'agent')
  const title = candidate.title?.trim()
  return title ? `${agent} · ${title}` : agent
}
