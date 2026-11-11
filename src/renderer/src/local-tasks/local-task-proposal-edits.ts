import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import {
  LocalTaskProposalItemSchema,
  type LocalTaskProposalItem
} from '../../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type { LocalTaskProposal } from '../../../shared/local-tasks/local-task-dispatcher-types'

/** The fields a person may change on one item; targets and the kind stay as proposed. */
export type LocalTaskProposalItemDraft = {
  title?: string
  prompt?: string
  agent?: string
  text?: string
  reason?: string
  /** The task project a start or record goes in, picked on the card rather than typed. */
  project?: string
}

/** The fields the item editor shows as inputs. */
export type LocalTaskProposalEditField = Exclude<keyof LocalTaskProposalItemDraft, 'project'>

/** Whether the item creates a task whose project the person may pick. */
export function localTaskProposalPicksProject(
  item: LocalTaskProposalItem
): item is Extract<LocalTaskProposalItem, { kind: 'start' | 'record' }> {
  return item.kind === 'start' || item.kind === 'record'
}

/** Which fields each kind lets the person change, in the order the editor shows them. */
export function localTaskProposalEditFields(
  item: LocalTaskProposalItem
): LocalTaskProposalEditField[] {
  switch (item.kind) {
    case 'start':
    case 'subtask':
      return ['title', 'prompt', 'agent']
    case 'append':
      return ['text']
    case 'stop':
      return ['reason']
    case 'record':
      return ['title']
    case 'link':
      return []
  }
}

/** The item with the draft applied, or null when the result is not a valid item of its kind. */
export function applyLocalTaskProposalItemDraft(
  item: LocalTaskProposalItem,
  draft: LocalTaskProposalItemDraft
): LocalTaskProposalItem | null {
  const allowed = new Set<string>(localTaskProposalEditFields(item))
  if (localTaskProposalPicksProject(item)) {
    allowed.add('project')
  }
  const changes = Object.fromEntries(
    Object.entries(draft).filter(([field, value]) => allowed.has(field) && value !== undefined)
  )
  const parsed = LocalTaskProposalItemSchema.safeParse({ ...item, ...changes })
  return parsed.success && parsed.data.kind === item.kind ? parsed.data : null
}

/**
 * Items the person changed before confirming, kept in this window only: they change what this
 * confirmation runs, never the proposal the dispatcher wrote.
 */
type EditsState = { byProposal: Record<string, Record<number, LocalTaskProposalItem>> }

export const localTaskProposalEditsStore = createStore<EditsState>(() => ({ byProposal: {} }))

const NO_EDITS: Record<number, LocalTaskProposalItem> = {}

export function useLocalTaskProposalEdits(
  proposalId: string
): Record<number, LocalTaskProposalItem> {
  return useStore(localTaskProposalEditsStore, (state) => state.byProposal[proposalId] ?? NO_EDITS)
}

export function setLocalTaskProposalItemEdit(
  proposalId: string,
  index: number,
  item: LocalTaskProposalItem | null
): void {
  localTaskProposalEditsStore.setState((state) => {
    const current = { ...state.byProposal[proposalId] }
    if (item) {
      current[index] = item
    } else {
      delete current[index]
    }
    const byProposal = { ...state.byProposal, [proposalId]: current }
    if (Object.keys(current).length === 0) {
      delete byProposal[proposalId]
    }
    return { byProposal }
  })
}

/** Drops the edits of proposals no longer waiting on this window. */
export function forgetLocalTaskProposalEdits(stillOpen: ReadonlySet<string>): void {
  const { byProposal } = localTaskProposalEditsStore.getState()
  const stale = Object.keys(byProposal).filter((id) => !stillOpen.has(id))
  if (stale.length === 0) {
    return
  }
  const next = { ...byProposal }
  for (const id of stale) {
    delete next[id]
  }
  localTaskProposalEditsStore.setState({ byProposal: next })
}

/** The proposal as this window runs it: the person's edits over the items the dispatcher wrote. */
export function withLocalTaskProposalEdits(proposal: LocalTaskProposal): LocalTaskProposal {
  const edits = localTaskProposalEditsStore.getState().byProposal[proposal.id]
  if (!edits) {
    return proposal
  }
  return {
    ...proposal,
    items: proposal.items.map((item, index) => {
      const edited = edits[index]
      return edited && edited.kind === item.kind ? edited : item
    })
  }
}
