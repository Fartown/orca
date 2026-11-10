import type { z } from 'zod'
import { LOCAL_TASK_PROPOSAL_ITEM_FORMATS } from '../../shared/local-tasks/local-task-brief'
import { LocalTaskProposalItemSchema } from '../../shared/local-tasks/local-task-dispatcher-rpc-params'

const FIELDS_BY_KIND: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  LocalTaskProposalItemSchema.options.map((option) => [
    (option.shape.kind as z.ZodLiteral<string>).value,
    new Set(Object.keys(option.shape))
  ])
)

function formatOf(kind: string): string | undefined {
  return (LOCAL_TASK_PROPOSAL_ITEM_FORMATS as Record<string, string>)[kind]
}

/**
 * What is wrong with each submitted item before the schema sees it: an unknown kind, or a field
 * that kind does not take. Why reject extra fields: the schema would drop them silently, and the
 * dispatcher would believe its intent (say, a subtask's workspace) was kept.
 */
export function localTaskProposalItemProblems(items: readonly unknown[]): string[] {
  return items.flatMap((item, at) => {
    if (!item || typeof item !== 'object') {
      return [`item ${at}: not an object`]
    }
    const raw = (item as { kind?: unknown }).kind
    const kind = typeof raw === 'string' ? raw : ''
    const fields = FIELDS_BY_KIND.get(kind)
    if (!fields) {
      return [`item ${at}: kind must be one of ${[...FIELDS_BY_KIND.keys()].join(', ')}`]
    }
    const unknown = Object.keys(item).filter((key) => !fields.has(key))
    return unknown.length > 0
      ? [`item ${at} (${kind}): unknown field ${unknown.join(', ')}. Write it as ${formatOf(kind)}`]
      : []
  })
}

/** The format line of each kind among the failing items, so one retry can get it right. */
export function localTaskProposalFormatHints(
  items: readonly unknown[],
  failingIndexes: ReadonlySet<number>
): string[] {
  const kinds = new Set(
    [...failingIndexes].map((at) => (items[at] as { kind?: unknown } | undefined)?.kind)
  )
  return [...kinds].flatMap((kind) => {
    const format = typeof kind === 'string' ? formatOf(kind) : undefined
    return format ? [`${kind}: ${format}`] : []
  })
}
