import type { LocalTask } from './local-task-types'

const ANCESTOR_SUMMARY_MAX = 600

type PromptTask = Pick<LocalTask, 'ref' | 'title' | 'description' | 'criteria'>
type AncestorTask = Pick<LocalTask, 'ref' | 'title' | 'description'>

/**
 * The prompt an agent starts with for a task (REQ-009, REQ-010): title, description and done
 * criteria; a subtask also carries a short summary of every ancestor, nearest first (pass
 * `localTaskAncestors`). Desktop and phone build it the same way, wherever the session starts.
 */
export function buildLocalTaskAgentPrompt(
  task: PromptTask,
  ancestors: readonly AncestorTask[] = []
): string {
  const sections = [`Task ${task.ref}: ${task.title.trim()}`]
  const description = task.description.trim()
  if (description) {
    sections.push(description)
  }
  const criteria = task.criteria.map((item) => item.trim()).filter(Boolean)
  if (criteria.length > 0) {
    sections.push(['Done criteria:', ...criteria.map((item) => `- ${item}`)].join('\n'))
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
  return sections.join('\n\n')
}
