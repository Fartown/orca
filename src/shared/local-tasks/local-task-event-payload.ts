import { LOCAL_TASK_PRIORITIES, type LocalTaskPriority } from './local-task-model'

type Payload = Record<string, unknown> | null

export function localTaskEventText(payload: Payload, key: string): string | null {
  const value = payload?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function localTaskEventTexts(payload: Payload, key: string): string[] {
  const value = payload?.[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function localTaskEventPriority(payload: Payload, key: string): LocalTaskPriority | null {
  return LOCAL_TASK_PRIORITIES.find((candidate) => candidate === payload?.[key]) ?? null
}

export function localTaskEventNumber(payload: Payload, key: string): number | null {
  const value = payload?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Which automatic rule wrote a `status` entry whose source is `rule`. */
export type LocalTaskEventRule = 'start' | 'pr-merged'

export function localTaskEventRule(payload: Payload): LocalTaskEventRule | null {
  const value = payload?.rule
  return value === 'start' || value === 'pr-merged' ? value : null
}
