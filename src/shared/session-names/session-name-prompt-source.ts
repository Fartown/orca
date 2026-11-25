import {
  getAgentRowPrimaryText,
  isOrcaDispatchPrompt
} from '../agent-status/presentation/agent-row-primary-text'

/** Extract the real task body from Orca dispatch preambles before bounded prompt slicing. */
export function extractSessionNamePromptSource(prompt: string): string {
  if (isOrcaDispatchPrompt(prompt)) {
    return getAgentRowPrimaryText({ prompt })
  }
  return prompt
}
