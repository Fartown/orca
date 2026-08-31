import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NATIVE_AGENT_ROW_CLASS,
  NATIVE_AGENT_ROW_SEND_TARGET_ATTRIBUTE
} from './native-agent-row-selectors'

const RENDERER_ROOT = join(import.meta.dirname, '..')
const NATIVE_ROW_FILES = [
  join(RENDERER_ROOT, 'components', 'dashboard', 'DashboardAgentRow.tsx'),
  join(RENDERER_ROOT, 'components', 'sidebar', 'worktree-card-compact-agent-row.tsx')
]

describe('native agent row selectors', () => {
  // Why: the Workspace row is untouched by Issues, so a rename there would silently stop closing the Issue page.
  it.each(NATIVE_ROW_FILES)(
    'keeps the DOM hooks the Issue row click capture relies on in %s',
    (file) => {
      const source = readFileSync(file, 'utf8')
      expect(source).toContain(NATIVE_AGENT_ROW_CLASS)
      expect(source).toContain(`${NATIVE_AGENT_ROW_SEND_TARGET_ATTRIBUTE}=`)
    }
  )
})
