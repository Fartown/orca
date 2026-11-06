import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { localTaskPromptFor } from './local-task-session-launch'
import { localTaskWorkflowPreferences } from './local-task-workflow-preferences'

export function localTaskDispatchPrompt(task: LocalTask): {
  text: string
  delivery: 'submit' | 'draft'
} {
  const preferences = localTaskWorkflowPreferences(task.id)
  const text = localTaskPromptFor(task)
  return {
    text: preferences.brief
      ? `${text}\n\nAfter starting, give this task a short title of no more than 30 characters: \`orca task update ${task.ref} --title "<short title>"\`.`
      : text,
    delivery: preferences.delivery === 'draft' ? 'draft' : 'submit'
  }
}
