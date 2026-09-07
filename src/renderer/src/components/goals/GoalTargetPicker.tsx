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
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const localWorktrees = useMemo(
    () =>
      worktrees
        .filter((worktree) => !worktree.hostId || worktree.hostId === 'local')
        .sort((a, b) => a.path.localeCompare(b.path)),
    [worktrees]
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
    <div className="grid gap-3">
      <div className="space-y-1">
        <Label htmlFor="goal-workspace">{translate('goals.editor.workspace', 'Workspace')}</Label>
        <Select
          value={value.worktreeId ?? ''}
          disabled={locked || lockWorkspace}
          onValueChange={(worktreeId) => onChange({ worktreeId, paneKey: null })}
        >
          <SelectTrigger id="goal-workspace" className="w-full">
            <SelectValue
              placeholder={translate('goals.editor.pickWorkspace', 'Pick a workspace')}
            />
          </SelectTrigger>
          <SelectContent>
            {localWorktrees.map((worktree) => (
              <SelectItem key={worktree.id} value={worktree.id}>
                {worktree.displayName || basename(worktree.path)}
                <span className="ml-1 text-muted-foreground">{worktree.path}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {translate('goals.editor.executionLocal', 'Runs on this machine.')}
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="goal-session">{translate('goals.editor.session', 'Agent session')}</Label>
        <Select
          value={value.paneKey ?? ''}
          disabled={locked || !value.worktreeId}
          onValueChange={(paneKey) => onChange({ worktreeId: value.worktreeId, paneKey })}
        >
          <SelectTrigger id="goal-session" className="w-full">
            <SelectValue
              placeholder={translate('goals.editor.pickSession', 'Pick a running agent session')}
            />
          </SelectTrigger>
          <SelectContent>
            {(lockedCandidate ? [lockedCandidate] : candidates).map((candidate) => (
              <SelectItem key={candidate.paneKey} value={candidate.paneKey}>
                {candidateLabel(candidate)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {value.worktreeId && candidates.length === 0 && !locked
            ? translate(
                'goals.editor.noSessions',
                'No agent session is running in this workspace. Start one first; plain shells cannot be targeted.'
              )
            : translate(
                'goals.editor.sessionHint',
                'Only sessions Orca can identify by their agent hooks are listed.'
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
