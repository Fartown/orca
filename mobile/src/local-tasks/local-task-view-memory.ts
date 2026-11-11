import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { z } from 'zod'
import { persistMirrored } from '../storage/mirrored-storage-keys'

/**
 * One key for every library, so the hybrid page is handed it by name (page-storage-keys.ts): the
 * phone keeps nothing per host that the page would have to be told about one by one.
 */
export const LOCAL_TASK_VIEW_STORAGE_KEY = 'orca:localTasksView'

// Why capped: the page is handed the whole value, which has a size limit; the oldest go first.
const REMEMBERED_LIBRARIES = 24

export type LocalTaskViewChoice = {
  /** Null is All projects. */
  projectId: string | null
  segment: 'attention' | 'started' | 'all'
  view: 'list' | 'board'
}

const choiceSchema = z.object({
  projectId: z.string().nullable(),
  segment: z.enum(['attention', 'started', 'all']),
  view: z.enum(['list', 'board'])
})

// Insertion order is recency: a write moves its library last.
const storedSchema = z.record(z.string(), z.unknown())

/** The libraries' choices as stored, dropping anything this build cannot read. */
export function readLocalTaskViewChoices(raw: string | null): Map<string, LocalTaskViewChoice> {
  const choices = new Map<string, LocalTaskViewChoice>()
  if (!raw) {
    return choices
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return choices
  }
  const stored = storedSchema.safeParse(parsed)
  if (!stored.success) {
    return choices
  }
  for (const [library, value] of Object.entries(stored.data)) {
    const choice = choiceSchema.safeParse(value)
    if (choice.success) {
      choices.set(library, choice.data)
    }
  }
  return choices
}

export function writeLocalTaskViewChoice(
  choices: ReadonlyMap<string, LocalTaskViewChoice>,
  library: string,
  choice: LocalTaskViewChoice
): string {
  const next = new Map(choices)
  next.delete(library)
  next.set(library, choice)
  const kept = [...next].slice(-REMEMBERED_LIBRARIES)
  return JSON.stringify(Object.fromEntries(kept))
}

let pending: Promise<unknown> = Promise.resolve()

/**
 * The project, segment and layout one library's page was left on (keyed by paired host and
 * library), read once when the page opens. `override` wins: a route into "Needs you" opens there.
 * Until the store answers the page shows `initial`; a choice the user makes first is kept.
 */
export function useLocalTaskViewMemory(
  library: string,
  initial: LocalTaskViewChoice,
  override: Partial<LocalTaskViewChoice> | null
): [LocalTaskViewChoice, (patch: Partial<LocalTaskViewChoice>) => void] {
  const [choice, setChoice] = useState<LocalTaskViewChoice>(() => ({ ...initial, ...override }))
  const touched = useRef(false)
  const latest = useRef(choice)
  useEffect(() => {
    let current = true
    void pending
      .then(() => AsyncStorage.getItem(LOCAL_TASK_VIEW_STORAGE_KEY))
      .catch(() => null)
      .then((raw) => {
        const stored = readLocalTaskViewChoices(raw).get(library)
        if (current && stored && !touched.current) {
          const next = { ...stored, ...override }
          latest.current = next
          setChoice(next)
        }
      })
    return () => {
      current = false
    }
    // Why once per library: the override is the route's, read when the page opened.
  }, [library])
  const update = (patch: Partial<LocalTaskViewChoice>) => {
    touched.current = true
    const next = { ...latest.current, ...patch }
    latest.current = next
    setChoice(next)
    // Through the mirrored write: the page is handed this key on every `init` (ruling 35).
    pending = pending
      .then(() => AsyncStorage.getItem(LOCAL_TASK_VIEW_STORAGE_KEY))
      .catch(() => null)
      .then((raw) =>
        persistMirrored(
          LOCAL_TASK_VIEW_STORAGE_KEY,
          writeLocalTaskViewChoice(readLocalTaskViewChoices(raw), library, next)
        )
      )
      .catch(() => {})
  }
  return [choice, update]
}
