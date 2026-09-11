import { createStore } from 'zustand/vanilla'
import type { AppState } from '../store/types'
import type { AiVaultSessionTitlesResult } from '../../../shared/ai-vault-session-title'
import { createTerminalTabPresentationActions } from '../store/terminals/terminal-tab-presentation'

export const LEAF = '11111111-1111-4111-8111-111111111111'
export const SIBLING = '22222222-2222-4222-8222-222222222222'
export const PANE = `tab:${LEAF}`

export function fixture() {
  const store = createStore<AppState>(
    () =>
      ({
        activeWorktreeId: 'workspace',
        activeWorkspaceExecutionHostId: 'ssh:dev-box',
        tabsByWorktree: {
          workspace: [
            {
              id: 'tab',
              worktreeId: 'workspace',
              ptyId: 'tab-primary',
              title: 'Shell',
              customTitle: null,
              color: null,
              sortOrder: 0,
              createdAt: 1,
              generation: 0
            }
          ]
        },
        unifiedTabsByWorktree: {
          workspace: [
            {
              id: 'unified',
              groupId: 'group',
              worktreeId: 'workspace',
              contentType: 'terminal',
              entityId: 'tab',
              label: 'Shell',
              customLabel: null,
              color: null,
              sortOrder: 0,
              createdAt: 1
            }
          ]
        },
        terminalLayoutsByTabId: {
          tab: {
            root: { type: 'leaf', leafId: LEAF },
            activeLeafId: LEAF,
            expandedLeafId: null,
            ptyIdsByLeafId: { [LEAF]: 'leaf-pty' }
          }
        },
        agentStatusByPaneKey: {
          [PANE]: {
            paneKey: PANE,
            tabId: 'tab',
            worktreeId: 'workspace',
            agentType: 'codex',
            providerSession: { key: 'session_id', id: 'A' },
            prompt: '',
            state: 'working',
            stateHistory: [],
            updatedAt: 1,
            stateStartedAt: 1
          }
        },
        sleepingAgentSessionsByPaneKey: {},
        retainedAgentsByPaneKey: {},
        worktreesByRepo: {},
        detectedWorktreesByRepo: {},
        folderWorkspaces: []
      }) as unknown as AppState
  )
  store.setState(createTerminalTabPresentationActions(store.setState, store.getState))
  const replaceIdentity = (id: string) =>
    store.setState((s) => ({
      agentStatusByPaneKey: {
        [PANE]: { ...s.agentStatusByPaneKey[PANE], providerSession: { key: 'session_id', id } }
      }
    }))
  const slot = () => store.getState().tabsByWorktree.workspace[0].aiVaultTitle
  return { ...store, replaceIdentity, slot }
}

export function nativeResult(title: string, sessionId = 'A'): AiVaultSessionTitlesResult {
  return {
    titles: [
      {
        agent: 'codex',
        sessionId,
        title,
        providerName: { kind: 'named', title, field: 'session_index.thread_name' }
      }
    ]
  }
}
