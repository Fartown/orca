import { activateStructuredAgentSessionTab } from '@/lib/agent-session/structured-agent-session-tab-activation'
import type { Tab } from '../../../../shared/tab-types'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAppStore } from '@/store'
import {
  getFolderWorkspaceWorktree,
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspace-record-selectors'
import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import { AgentStateDot } from '@/components/AgentStateDot'
import { translate } from '@/i18n/i18n'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { useLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import { localTaskWorktreeHostId } from '@/local-tasks/local-task-workspace-resolution'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { revealTerminalPane } from '@/lib/reveal-terminal-pane'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type { Worktree } from '../../../../shared/worktree/types'

const EMPTY_TABS: Tab[] = []

function WorkspaceSessions({ worktree }: { worktree: Worktree }): React.JSX.Element | null {
  const hostId = useAppStore((state) => localTaskWorktreeHostId(state, worktree))
  const inContact = useLocalTaskHostInContact(hostId)
  const rows = useWorktreeAgentRows(worktree.id)
  const tabs = useAppStore((state) => state.unifiedTabsByWorktree[worktree.id] ?? EMPTY_TABS)
  const chats = tabs.filter((tab) => tab.contentType === 'agent-session')
  if (rows.length === 0 && chats.length === 0) {
    return null
  }
  return (
    <div className="ml-3 flex flex-col gap-0.5">
      <span className="truncate pt-2 text-2xs text-muted-foreground">
        {worktree.displayName ?? worktree.branch}
      </span>
      {rows.map((row) => (
        <div key={row.paneKey} className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            data-task-tree-row
            disabled={!inContact}
            className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left text-xs hover:bg-sidebar-accent disabled:opacity-60"
            onClick={() => {
              const pane = parsePaneKey(row.activationPaneKey ?? row.paneKey)
              if (pane) {
                revealTerminalPane({
                  worktreeId: worktree.id,
                  tabId: pane.tabId,
                  leafId: pane.leafId,
                  executionHostId: hostId
                })
              }
            }}
          >
            <AgentStateDot state={inContact ? row.state : 'unverifiable'} size="sm" />
            <span className="truncate">
              {row.entry.lastAssistantMessage ?? row.tab.title ?? row.agentType}
            </span>
          </button>
          <button
            type="button"
            className="shrink-0 text-2xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              openLocalTaskPage({ create: true })
              localTaskPageStore.getState().openCreate({
                source: {
                  worktree,
                  paneKey: row.activationPaneKey ?? row.paneKey,
                  agent: row.agentType,
                  title: (row.entry.lastAssistantMessage ?? row.tab.title ?? row.agentType).slice(
                    0,
                    60
                  )
                }
              })
            }}
          >
            {translate('localTasks.sidebar.record', 'Make task…')}
          </button>
        </div>
      ))}
      {chats.map((tab) => (
        <div key={tab.id} className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            data-task-tree-row
            disabled={!inContact}
            className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left text-xs hover:bg-sidebar-accent disabled:opacity-60"
            onClick={() =>
              activateStructuredAgentSessionTab({ worktreeId: worktree.id, tabId: tab.id })
            }
          >
            <span className="truncate">
              {(tab.customLabel ?? tab.label) || translate('localTasks.links.surfaceChat', 'Chat')}
            </span>
          </button>
          <button
            type="button"
            className="shrink-0 text-2xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              openLocalTaskPage({ create: true })
              localTaskPageStore.getState().openCreate({
                source: {
                  worktree,
                  paneKey: '',
                  tabId: tab.id,
                  sessionId: tab.entityId,
                  agent: tab.agentSessionAgent ?? '',
                  title:
                    (tab.customLabel ?? tab.label) ||
                    translate('localTasks.links.surfaceChat', 'Chat')
                }
              })
            }}
          >
            {translate('localTasks.sidebar.record', 'Make task…')}
          </button>
        </div>
      ))}
    </div>
  )
}

export function LocalTaskUnlinkedSessions(): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const worktrees = useAppStore(selectWorktreesByRepo)
  const folders = useAppStore(selectFolderWorkspaces)
  const links = useLocalTasksDomain((state) => state.links.workspaces)
  const candidates = useMemo(
    () =>
      [
        ...Object.values(worktrees).flat(),
        ...folders.map((folder) => getFolderWorkspaceWorktree(folder))
      ].filter(
        (worktree) =>
          !worktree.isArchived &&
          !worktree.isBare &&
          !links.some(
            (link) =>
              link.worktreeId === worktree.id && link.hostId === (worktree.hostId ?? 'local')
          )
      ),
    [worktrees, folders, links]
  )
  return (
    <div className="mt-3 border-t border-sidebar-border pt-2">
      <button
        type="button"
        data-task-tree-row
        aria-expanded={expanded}
        className="flex h-7 w-full items-center gap-1.5 text-left text-xs text-muted-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {translate('localTasks.sidebar.unlinked', 'Sessions without a task')}
      </button>
      {expanded
        ? candidates.map((worktree) => (
            <WorkspaceSessions key={`${worktree.hostId}:${worktree.id}`} worktree={worktree} />
          ))
        : null}
    </div>
  )
}
