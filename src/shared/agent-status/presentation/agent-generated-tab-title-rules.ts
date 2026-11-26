// Store and layout-owner main derive generated tab titles by the same rule.

import type { AiVaultSessionTitle } from '../../ai-vault/contracts/ai-vault-session-title'
import { isEligibleSessionNamePrompt } from '../../session-names/session-name-candidate-quality'
import { sessionNameSlotSupersededByStatus } from '../../session-names/runtime-host-connection-owner'
import { deriveGeneratedTabTitle } from './agent-tab-title'
import {
  getAgentRowGeneratedTitleText,
  getOrcaDispatchTaskId,
  isOrcaDispatchPrompt,
  orchestrationLabelsMatchLiveDispatch
} from './agent-row-primary-text'
import type { AgentStatusEntry } from '../contracts/agent-status-types'

type TitleStatus = Pick<AgentStatusEntry, 'orchestration' | 'prompt'> &
  Partial<Pick<AgentStatusEntry, 'agentType' | 'providerSession' | 'sessionBoundary'>>

/** The titles of a tab a generated title must not cover or replace. */
export type GeneratedTitleTab = {
  customTitle?: string | null
  quickCommandLabel?: string | null
  generatedTitle?: string | null
  aiVaultTitle?: AiVaultSessionTitle | null
}

/** A user's rename or a quick command's label: a generated title never goes on such a tab. */
export function tabHasProtectedTitle(tab: GeneratedTitleTab): boolean {
  return Boolean(tab.customTitle?.trim() || tab.quickCommandLabel?.trim())
}

/** Sticky orchestration titles are replaced only when they still describe this dispatch. */
export function generatedTitleReplacesExisting(entry: TitleStatus): boolean {
  const hasMatchingOrchestrationLabels = Boolean(
    (entry.orchestration?.displayName?.trim() || entry.orchestration?.taskTitle?.trim()) &&
    orchestrationLabelsMatchLiveDispatch(entry)
  )
  const liveDispatchTaskId = isOrcaDispatchPrompt(entry.prompt)
    ? getOrcaDispatchTaskId(entry.prompt)
    : null
  const stickyOrchestrationTaskId = entry.orchestration?.taskId?.trim() || null
  return (
    hasMatchingOrchestrationLabels ||
    Boolean(
      liveDispatchTaskId &&
      stickyOrchestrationTaskId &&
      liveDispatchTaskId !== stickyOrchestrationTaskId
    )
  )
}

/** The text a status's title is derived from: a dispatch's task, not its preamble. */
export function generatedTitleSourceText(entry: TitleStatus): string {
  return isOrcaDispatchPrompt(entry.prompt) ? getAgentRowGeneratedTitleText(entry) : entry.prompt
}

export function generatedTabTitleForStatus(
  entry: TitleStatus,
  tab: GeneratedTitleTab
): { title: string; replaceExisting: boolean } | null {
  // Fork (session-names): protected titles stay separate candidates, and ineligible text cannot block the first valid task.
  const superseded = sessionNameSlotSupersededByStatus(tab.aiVaultTitle, entry)
  const replaceExisting = generatedTitleReplacesExisting(entry) || superseded
  const existing =
    tab.generatedTitle?.trim() ||
    (!superseded ? tab.aiVaultTitle?.generatedTitle?.trim() : undefined)
  if (isEligibleSessionNamePrompt(existing ?? '') && !replaceExisting) {
    return null
  }
  const source = generatedTitleSourceText(entry)
  const title = source.length > 0 ? deriveGeneratedTabTitle(source) : null
  return title && title !== tab.generatedTitle?.trim()
    ? { title, replaceExisting: replaceExisting || Boolean(tab.generatedTitle?.trim()) }
    : null
}
