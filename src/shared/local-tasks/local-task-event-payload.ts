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
