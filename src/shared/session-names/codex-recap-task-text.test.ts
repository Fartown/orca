import { describe, expect, it } from 'vitest'
import { isCodexRecapTaskText } from './codex-recap-task-text'
import { isEligibleSessionNamePrompt } from './session-name-candidate-quality'
import { deriveGeneratedTabTitle } from '../agent-tab-title'

const RECAP_PROMPT =
  'Write a brief catch-up for a user returning to this Codex task. In at most 40 words and one or two plain-text sentences, explain the objective, what was completed or learned, and the next step.'

describe('Codex recap task text', () => {
  it('rejects the recap prompt and the name a leaked one was stored as', () => {
    expect(isCodexRecapTaskText(RECAP_PROMPT)).toBe(true)
    expect(deriveGeneratedTabTitle(RECAP_PROMPT)).toBeNull()
    // The name already on disk for panes that leaked before the hook guard widened.
    expect(isCodexRecapTaskText('Write a brief catch up for a user')).toBe(true)
    expect(isEligibleSessionNamePrompt('Write a brief catch up for a user')).toBe(false)
  })

  it('leaves real prompts that mention a catch-up alone', () => {
    const real = 'Write a brief catch-up doc for the team about the release'
    expect(isCodexRecapTaskText(real)).toBe(false)
    expect(isEligibleSessionNamePrompt(real)).toBe(true)
    expect(isCodexRecapTaskText('把 catch up 逻辑改一下')).toBe(false)
    expect(isCodexRecapTaskText('')).toBe(false)
    expect(isCodexRecapTaskText(null)).toBe(false)
  })
})
