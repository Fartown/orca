import { isLocalTaskProgressPayload } from './local-task-progress'
import type { LocalTaskProgressSection } from './local-task-progress-sections'
import type { LocalTaskEvent } from './local-task-types'

const SECTION_LABELS = {
  selfCheck: ['自检', '自测', '验证', 'self-check', 'selfcheck', 'checks', 'tests'],
  verify: ['验收', '在哪验收', '验收入口', '验收方式', 'verify', 'acceptance']
} as const

/** The text under a writeback's 自检 or 验收 heading, in either language; null when it has none. */
export function localTaskWritebackSection(
  sections: readonly LocalTaskProgressSection[] | null,
  kind: keyof typeof SECTION_LABELS
): string | null {
  const wanted: readonly string[] = SECTION_LABELS[kind]
  return sections?.find((section) => wanted.includes(section.label.toLowerCase()))?.text ?? null
}

export type LocalTaskWriteback = {
  event: LocalTaskEvent
  /** 1-based, in the order they were written. */
  number: number
  sessionLinkId: string | null
}

/** A task's agent writebacks (REQ-022) among its events, oldest first. */
export function localTaskWritebacks(
  events: readonly LocalTaskEvent[] | undefined
): LocalTaskWriteback[] {
  // Why a copy and sort: the phone's Hermes has no toSorted.
  return [...(events ?? [])]
    .filter((event) => event.kind === 'comment' && isLocalTaskProgressPayload(event.payload))
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((event, at) => ({
      event,
      number: at + 1,
      sessionLinkId:
        typeof event.payload?.sessionLinkId === 'string' ? event.payload.sessionLinkId : null
    }))
}

function lastMatching(
  writebacks: readonly LocalTaskWriteback[],
  matches: (writeback: LocalTaskWriteback) => boolean
): LocalTaskWriteback | null {
  for (let at = writebacks.length - 1; at >= 0; at -= 1) {
    if (matches(writebacks[at])) {
      return writebacks[at]
    }
  }
  return null
}

/** The writeback a task's latest progress came from, matched by time and then by text. */
export function findLocalTaskWriteback(
  writebacks: readonly LocalTaskWriteback[],
  progress: { at: number; body: string }
): LocalTaskWriteback | null {
  return (
    lastMatching(writebacks, (writeback) => writeback.event.createdAt === progress.at) ??
    lastMatching(writebacks, (writeback) => writeback.event.body === progress.body)
  )
}
