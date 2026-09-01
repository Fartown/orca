import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER_ROOT = join(import.meta.dirname, '..')
const SOURCE_ROOT = join(RENDERER_ROOT, '..', '..')
const RENDERER_NATIVE_FILES = [
  join(RENDERER_ROOT, 'components', 'right-sidebar', 'AiVaultSessionRow.tsx'),
  join(RENDERER_ROOT, 'components', 'right-sidebar', 'AiVaultPanel.tsx'),
  join(RENDERER_ROOT, 'components', 'AiVaultTabTitleSyncGate.tsx'),
  join(RENDERER_ROOT, 'lib', 'canonical-session-titles.ts'),
  join(RENDERER_ROOT, 'components', 'right-sidebar', 'use-canonical-session-titles.ts'),
  join(RENDERER_ROOT, 'components', 'right-sidebar', 'ai-vault-original-pane-actions.ts'),
  join(RENDERER_ROOT, 'components', 'right-sidebar', 'ai-vault-original-pane-index.ts'),
  join(RENDERER_ROOT, 'components', 'right-sidebar', 'ai-vault-original-pane.ts'),
  join(RENDERER_ROOT, 'components', 'right-sidebar', 'ai-vault-provider-session-resolution.ts'),
  join(RENDERER_ROOT, 'components', 'right-sidebar', 'ai-vault-session-identity.ts'),
  join(RENDERER_ROOT, 'components', 'right-sidebar', 'ai-vault-session-launch-actions.ts'),
  join(RENDERER_ROOT, 'components', 'dashboard', 'DashboardAgentRow.tsx'),
  join(RENDERER_ROOT, 'components', 'sidebar', 'WorktreeCardAgents.tsx'),
  join(RENDERER_ROOT, 'components', 'sidebar', 'useWorktreeAgentRows.ts'),
  join(RENDERER_ROOT, 'components', 'sidebar', 'worktree-card-compact-agent-row.tsx'),
  join(RENDERER_ROOT, 'components', 'sidebar', 'worktree-card-secondary-rows.tsx'),
  join(RENDERER_ROOT, 'components', 'sidebar', 'worktree-list', 'rows', 'folder-row.tsx'),
  join(RENDERER_ROOT, 'components', 'sidebar', 'worktree-list', 'rows', 'HostSectionHeader.tsx'),
  join(RENDERER_ROOT, 'components', 'terminal-pane', 'use-terminal-tab-cold-parking.ts'),
  join(RENDERER_ROOT, 'lib', 'ai-vault-tab-title-batches.ts'),
  join(RENDERER_ROOT, 'lib', 'ai-vault-tab-title-sync.ts'),
  join(RENDERER_ROOT, 'lib', 'launch-agent-in-new-tab.ts'),
  join(RENDERER_ROOT, 'lib', 'launch-agent-web-host-tab.ts'),
  join(RENDERER_ROOT, 'lib', 'launch-ai-vault-session.ts'),
  join(RENDERER_ROOT, 'runtime', 'runtime-rpc-client.ts'),
  join(RENDERER_ROOT, 'runtime', 'runtime-rpc-environment-call.ts'),
  join(RENDERER_ROOT, 'store', 'index.ts')
]
const MAIN_NATIVE_FILES = [
  join(SOURCE_ROOT, 'main', 'agent-hooks', 'server.ts'),
  join(SOURCE_ROOT, 'main', 'local-worktree-filesystem.ts'),
  join(SOURCE_ROOT, 'main', 'orcad', 'orcad-entry.ts'),
  join(SOURCE_ROOT, 'main', 'runtime', 'agent-session-claim-identity.ts'),
  join(SOURCE_ROOT, 'main', 'window', 'attach-main-window-services.ts')
]
const RENDERER_ISSUE_IMPORT = /(?:from\s+|import\(\s*)['"]@\/issues(?:\/|['"])/
const MAIN_ISSUE_IMPORT = /(?:from\s+|import\(\s*)['"](?:\.\.\/)+issues(?:\/|['"])/

describe('Issue native dependency boundary', () => {
  it('keeps AI Vault, Workspace and Dashboard runtime code independent from Issues', () => {
    const violations = RENDERER_NATIVE_FILES.filter((file) =>
      RENDERER_ISSUE_IMPORT.test(readFileSync(file, 'utf8'))
    ).map((file) => relative(RENDERER_ROOT, file))

    expect(violations).toEqual([])
  })

  it('keeps Hook, main-window and runtime core independent from Issues', () => {
    const violations = MAIN_NATIVE_FILES.filter((file) =>
      MAIN_ISSUE_IMPORT.test(readFileSync(file, 'utf8'))
    ).map((file) => relative(SOURCE_ROOT, file))

    expect(violations).toEqual([])
  })
})
