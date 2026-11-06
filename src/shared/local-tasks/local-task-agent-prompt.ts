import type { LocalTask } from './local-task-types'
import { buildLocalTaskBrief } from './local-task-brief'

const ANCESTOR_SUMMARY_MAX = 600

type PromptTask = Pick<LocalTask, 'ref' | 'title' | 'description'>
type AncestorTask = Pick<LocalTask, 'ref' | 'title' | 'description'>

/**
 * The prompt an agent starts with for a task (REQ-009, REQ-010): title and description;
 * a subtask also carries a short summary of every ancestor, nearest first (pass
 * `localTaskAncestors`). Desktop and phone build it the same way, wherever the session starts.
 */
export function buildLocalTaskAgentPrompt(
  task: PromptTask,
  ancestors: readonly AncestorTask[] = [],
  options: { brief?: boolean } = {}
): string {
  const sections = [`Task ${task.ref}: ${task.title.trim()}`]
  const description = task.description.trim()
  if (description) {
    sections.push(description)
  }
  for (const [depth, ancestor] of ancestors.entries()) {
    const summary = ancestor.description.trim()
    const clipped =
      summary.length > ANCESTOR_SUMMARY_MAX ? `${summary.slice(0, ANCESTOR_SUMMARY_MAX)}…` : summary
    const relation = depth === 0 ? 'This is a subtask of' : 'Which is part of'
    sections.push(
      [`${relation} ${ancestor.ref}: ${ancestor.title.trim()}`, clipped].filter(Boolean).join('\n')
    )
  }
  if (options.brief !== false) {
    sections.push(buildLocalTaskBrief(task.ref))
  }
  return sections.join('\n\n')
}
