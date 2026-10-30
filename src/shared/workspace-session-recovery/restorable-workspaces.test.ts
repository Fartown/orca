import { describe, expect, it } from 'vitest'
import { getDefaultWorkspaceSession } from '../constants'
import { restorableRuntimeSessionOwners, restorableWorkspaceIds } from './restorable-workspaces'

describe('restorable runtime workspace content', () => {
  it('does not turn terminal selection, focus history or empty layouts into workspaces', () => {
    const session = {
      ...getDefaultWorkspaceSession(),
      activeWorktreeId: 'removed::/srv/old',
      activeTabTypeByWorktree: { 'removed::/srv/old': 'terminal' as const },
      lastVisitedAtByWorktreeId: { 'removed::/srv/old': 1 },
      tabGroups: { 'removed::/srv/old': [] },
      tabsByWorktree: { 'removed::/srv/old': [] }
    }
    expect(
      restorableRuntimeSessionOwners(session, {
        'removed::/srv/old': 'runtime:host'
      })
    ).toEqual({})
  })

  it('retains real terminal, editor, browser, structured and sleeping content', () => {
    expect([
      ...restorableWorkspaceIds({
        tabsByWorktree: { 'worktree:terminal::C:\\work': [{}] },
        openFilesByWorktree: { 'editor::/srv/file': [{}] },
        browserTabsByWorktree: { 'browser::/srv/browser': [{}] },
        browserPagesByWorkspace: { 'folder:folder-id': [{}] },
        unifiedTabs: { 'chat::/srv/chat': [{}] },
        sleepingAgentSessionsByPaneKey: { pane: { worktreeId: 'sleeping::/srv/sleep' } }
      })
    ]).toEqual([
      'terminal::C:\\work',
      'editor::/srv/file',
      'browser::/srv/browser',
      'folder:folder-id',
      'chat::/srv/chat',
      'sleeping::/srv/sleep'
    ])
  })
})
