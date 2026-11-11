import { useMemo } from 'react'
import { getAgentCatalog, type AgentCatalogEntry } from '@/lib/agent-catalog'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { selectLocalTaskHostLabel } from '@/local-tasks/local-task-host-label'
import { filterEnabledTuiAgents, pickTuiAgent } from '../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { Worktree } from '../../../shared/worktree/types'
import { localTaskWorktreeHostId } from './local-task-workspace-resolution'

export type LocalTaskLaunchAgents = {
  /** Enabled agents, narrowed to the ones installed on the workspace's host once it answers. */
  agents: AgentCatalogEntry[]
  /** What a session opens with unless the user picks another: the default when usable there. */
  preferred: TuiAgent | null
  /** The user's default agent from Settings, when it is one of `agents`. */
  defaultAgent: TuiAgent | null
  /** Why no agent can be picked, said where the picker is. */
  unavailableReason: string | null
}

/**
 * The agents a task session can open with in this workspace, as the New session dialog lists them
 * (REQ-010). Null asks nothing of any host.
 */
export function useLocalTaskLaunchAgents(worktree: Worktree | null): LocalTaskLaunchAgents {
  const settings = useAppStore((state) => state.settings)
  const hostLabel = useAppStore((state) =>
    worktree ? selectLocalTaskHostLabel(state, localTaskWorktreeHostId(state, worktree)) : ''
  )
  const target = useAgentDetectionTargetForWorktree(worktree?.id ?? null)
  const { detectedIds } = useDetectedAgents(worktree ? target : undefined)
  return useMemo(() => {
    const catalog = getAgentCatalog()
    const enabled = new Set(
      filterEnabledTuiAgents(
        catalog.map((entry) => entry.id),
        settings?.disabledTuiAgents
      )
    )
    const agents = catalog.filter(
      (entry) => enabled.has(entry.id) && (detectedIds === null || detectedIds.includes(entry.id))
    )
    const preferred = pickTuiAgent(
      settings?.defaultTuiAgent,
      agents.map((entry) => entry.id),
      settings?.disabledTuiAgents
    )
    const configured = settings?.defaultTuiAgent
    const defaultAgent =
      configured && configured !== 'blank' && agents.some((entry) => entry.id === configured)
        ? configured
        : null
    // Why spelled out: a greyed choice alone does not say whether to install or to turn one on.
    const unavailableReason = preferred
      ? null
      : enabled.size > 0
        ? translate(
            'localTasks.links.noAgentOnHost',
            'No enabled agent was found on {{host}}. Install one there, or turn one on in Settings → Agents.',
            { host: hostLabel }
          )
        : translate(
            'localTasks.links.noAgentEnabled',
            'Every agent is turned off in Settings → Agents. Turn one on to start a session.'
          )
    return { agents, preferred, defaultAgent, unavailableReason }
  }, [detectedIds, hostLabel, settings?.defaultTuiAgent, settings?.disabledTuiAgents])
}
