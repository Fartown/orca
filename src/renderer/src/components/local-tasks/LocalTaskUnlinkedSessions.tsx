import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageSquare, Plus } from 'lucide-react'
import { activateStructuredAgentSessionTab } from '@/lib/agent-session/structured-agent-session-tab-activation'
import { Button } from '@/components/ui/button'
import { AgentStateDot, agentStateLabel } from '@/components/AgentStateDot'
import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import { translate } from '@/i18n/i18n'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { revealTerminalPane } from '@/lib/reveal-terminal-pane'
import { useAppStore } from '@/store'
import {
  getFolderWorkspaceWorktree,
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspace-record-selectors'
import { useLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import { findLocalTaskLinkForWorkspace } from '@/local-tasks/local-task-link-selectors'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import {
  localTaskPageStore,
  type LocalTaskCreateDefaults
} from '@/local-tasks/local-task-page-store'
import {
  LOCAL_TASK_TREE_UNLINKED_KEY,
  localTaskSidebarTreeStore,
  useLocalTaskSidebarTreeExpanded
} from '@/local-tasks/local-task-sidebar-tree'
import { localTaskWorktreeHostId } from '@/local-tasks/local-task-workspace-resolution'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type { Tab } from '../../../../shared/tab-types'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { Worktree } from '../../../../shared/worktree/types'
import { LocalTaskSidebarTreeRow } from './LocalTaskSidebarTreeRow'

const EMPTY_TABS: Tab[] = []

type CreateSource = NonNullable<LocalTaskCreateDefaults['source']>

/** 记成任务…: the new-task form, titled from the session and placed in its workspace. */
function RecordButton({ source }: { source: CreateSource }): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="xs"
      tabIndex={-1}
      className="h-5"
      onClick={() => {
        openLocalTaskPage({ create: true })
        localTaskPageStore.getState().openCreate({ source })
      }}
    >
      <Plus className="size-3" />
      <span className="text-2xs">{translate('localTasks.sidebar.record', 'Make task…')}</span>
    </Button>
  )
}

function SessionLine({
  icon,
  name,
  place,
  state,
  lastLine
}: {
  icon: React.ReactNode
  name: string
  place: string
  state: string
  lastLine: string | null
}): React.JSX.Element {
  return (
    <>
      <span className="flex h-5 min-w-0 items-center gap-1.5">
        {icon}
        <span className="shrink-0 text-xs text-sidebar-foreground">{name}</span>
        <span className="min-w-0 truncate text-2xs text-muted-foreground">
          · {place} · {state}
        </span>
      </span>
      {lastLine ? (
        <span className="block truncate text-2xs leading-4 text-muted-foreground" title={lastLine}>
          {lastLine}
        </span>
      ) : null}
    </>
  )
}

/** One workspace no task holds: its agent terminals and chats as session rows, counted for the group. */
function WorkspaceSessions({
  worktree,
  report
}: {
  worktree: Worktree
  report: (key: string, count: number) => void
}): React.JSX.Element | null {
  const hostId = useAppStore((state) => localTaskWorktreeHostId(state, worktree))
  const linked = useLocalTasksDomain(
    (state) =>
      findLocalTaskLinkForWorkspace(state.links, {
        id: worktree.id,
        hostId,
        ...(worktree.instanceId ? { instanceId: worktree.instanceId } : {})
      }) !== null
  )
  const inContact = useLocalTaskHostInContact(hostId)
  const agentRows = useWorktreeAgentRows(worktree.id, !linked)
  const tabs = useAppStore((state) => state.unifiedTabsByWorktree[worktree.id] ?? EMPTY_TABS)
  const chats = linked ? EMPTY_TABS : tabs.filter((tab) => tab.contentType === 'agent-session')
  const rows = linked ? [] : agentRows
  const key = `${hostId}:${worktree.id}`
  const count = rows.length + chats.length
  useEffect(() => {
    report(key, count)
    return () => report(key, 0)
  }, [count, key, report])
  if (count === 0) {
    return null
  }
  const place = worktree.displayName ?? worktree.branch
  const chatLabel = translate('localTasks.links.surfaceChat', 'Chat')
  return (
    <>
      {rows.map((row) => {
        const lastLine = row.entry.lastAssistantMessage ?? null
        const name = isTuiAgent(row.agentType)
          ? getAgentLabel(row.agentType)
          : formatAgentTypeLabel(row.agentType)
        return (
          <LocalTaskSidebarTreeRow
            key={row.paneKey}
            node="session"
            depth={1}
            disabled={!inContact}
            aria-label={`${name} · ${place}`}
            onActivate={() => {
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
            trailing={
              <RecordButton
                source={{
                  worktree,
                  paneKey: row.activationPaneKey ?? row.paneKey,
                  agent: row.agentType,
                  title: (lastLine ?? row.tab.title ?? name).slice(0, 60)
                }}
              />
            }
          >
            <SessionLine
              icon={
                <>
                  <AgentStateDot state={inContact ? row.state : 'unverifiable'} size="sm" />
                  <AgentIcon agent={isTuiAgent(row.agentType) ? row.agentType : null} size={12} />
                </>
              }
              name={name}
              place={place}
              state={agentStateLabel(inContact ? row.state : 'unverifiable')}
              lastLine={lastLine}
            />
          </LocalTaskSidebarTreeRow>
        )
      })}
      {chats.map((tab) => {
        const label = (tab.customLabel ?? tab.label) || chatLabel
        const agent = isTuiAgent(tab.agentSessionAgent) ? tab.agentSessionAgent : null
        return (
          <LocalTaskSidebarTreeRow
            key={tab.id}
            node="session"
            depth={1}
            disabled={!inContact}
            aria-label={`${label} · ${place}`}
            onActivate={() =>
              activateStructuredAgentSessionTab({ worktreeId: worktree.id, tabId: tab.id })
            }
            trailing={
              <RecordButton
                source={{
                  worktree,
                  paneKey: '',
                  tabId: tab.id,
                  sessionId: tab.entityId,
                  agent: tab.agentSessionAgent ?? '',
                  title: label
                }}
              />
            }
          >
            <SessionLine
              icon={
                agent ? (
                  <AgentIcon agent={agent} size={12} />
                ) : (
                  <MessageSquare className="size-3 shrink-0 text-muted-foreground" />
                )
              }
              name={agent ? getAgentLabel(agent) : label}
              place={place}
              state={chatLabel}
              lastLine={agent ? label : null}
            />
          </LocalTaskSidebarTreeRow>
        )
      })}
    </>
  )
}

/**
 * 未关联任务的会话: sessions in workspaces no task holds, so task mode can still reach them. Each
 * can become a task (记成任务…); a workspace a task already holds links its sessions from the chip.
 */
export function LocalTaskUnlinkedSessions(): React.JSX.Element {
  const open = useLocalTaskSidebarTreeExpanded(LOCAL_TASK_TREE_UNLINKED_KEY)
  const worktrees = useAppStore(selectWorktreesByRepo)
  const folders = useAppStore(selectFolderWorkspaces)
  const candidates = useMemo(
    () =>
      [
        ...Object.values(worktrees).flat(),
        ...folders.map((folder) => getFolderWorkspaceWorktree(folder))
      ].filter((worktree) => !worktree.isArchived && !worktree.isBare),
    [worktrees, folders]
  )
  const [counts, setCounts] = useState<Readonly<Record<string, number>>>({})
  const report = useCallback((key: string, count: number) => {
    setCounts((previous) =>
      (previous[key] ?? 0) === count ? previous : { ...previous, [key]: count }
    )
  }, [])
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const label = translate('localTasks.sidebar.unlinked', 'Sessions without a task')
  return (
    <>
      <LocalTaskSidebarTreeRow
        node="view"
        depth={0}
        expanded={open}
        onToggle={() =>
          localTaskSidebarTreeStore.getState().setExpanded(LOCAL_TASK_TREE_UNLINKED_KEY, !open)
        }
        aria-label={label}
        onActivate={() =>
          localTaskSidebarTreeStore.getState().setExpanded(LOCAL_TASK_TREE_UNLINKED_KEY, !open)
        }
      >
        <span className="flex h-7 min-w-0 items-center gap-2 text-[13px]">
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            <MessageSquare className="size-3.5" />
          </span>
          <span className="min-w-0 truncate text-sidebar-foreground">{label}</span>
          {/* Why only open: counting reads every workspace's agents, which a closed group skips. */}
          {open ? (
            <span className="ml-auto shrink-0 pl-1 text-2xs tabular-nums text-muted-foreground">
              {total}
            </span>
          ) : null}
        </span>
      </LocalTaskSidebarTreeRow>
      {open
        ? candidates.map((worktree) => (
            <WorkspaceSessions
              key={`${worktree.hostId ?? 'local'}:${worktree.id}`}
              worktree={worktree}
              report={report}
            />
          ))
        : null}
    </>
  )
}
