import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import {
  localTaskCreateChoiceBlocked,
  useLocalTaskCreateWorkspaceChoices
} from './local-task-create-workspace-choices'
import type { LocalTaskPromptDelivery } from './local-task-session-launch'
import { localTaskWorkflowPreferences } from './local-task-workflow-preferences'
import { useLocalTaskLaunchAgents } from './use-local-task-launch-agents'

export type LocalTaskCreateWhereChoice = 'existing' | 'new' | 'later'

/**
 * New task's 在哪做 step (REQ-027): which branch, the picked workspace, and the session it opens
 * there. A pick whose host leaves contact stays picked but blocked until contact returns.
 */
export function useLocalTaskCreateWhere(args: {
  writableProjects: readonly LocalTaskProject[]
  projectId: string | null
  sourceWorktreeId: string | null
}) {
  const [where, setWhere] = useState<LocalTaskCreateWhereChoice>('existing')
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [agentChoice, setAgentChoice] = useState<TuiAgent | 'none' | null>(null)
  const [firstLine, setFirstLine] = useState(() =>
    translate('localTasks.createFlow.firstLineDefault', 'Start from the task description')
  )
  const [deliveryChoice, setDeliveryChoice] = useState<LocalTaskPromptDelivery | null>(null)
  const choices = useLocalTaskCreateWorkspaceChoices(args)
  const picked = choices.find((choice) => choice.key === pickedKey) ?? null
  const usablePick = picked && localTaskCreateChoiceBlocked(picked) === null ? picked : null
  const kickoffShown = args.sourceWorktreeId === null && where === 'existing' && usablePick !== null
  const launch = useLocalTaskLaunchAgents(kickoffShown ? usablePick.candidate.worktree : null)
  const agent: TuiAgent | null =
    agentChoice === 'none'
      ? null
      : agentChoice && launch.agents.some((entry) => entry.id === agentChoice)
        ? agentChoice
        : launch.preferred
  const workflow = args.projectId ? localTaskWorkflowPreferences(args.projectId) : null
  return {
    where,
    setWhere,
    choices,
    pickedKey,
    setPickedKey,
    picked,
    usablePick,
    query,
    setQuery,
    kickoffShown,
    launch,
    agent,
    setAgentChoice,
    firstLine,
    setFirstLine,
    delivery: deliveryChoice ?? workflow?.delivery ?? 'auto-submit',
    setDeliveryChoice,
    briefOn: workflow?.brief !== false
  }
}

export type LocalTaskCreateWhereState = Omit<
  ReturnType<typeof useLocalTaskCreateWhere>,
  'setWhere'
> & {
  setWhere: (where: LocalTaskCreateWhereChoice) => void
}
