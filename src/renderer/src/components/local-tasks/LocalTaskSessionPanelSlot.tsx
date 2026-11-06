import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Maximize2, Minimize2, PanelRightClose, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { SYNC_FIT_PANES_EVENT } from '@/constants/terminal'
import { requestBackgroundTerminalWorktreeMount } from '@/components/terminal/background-terminal-worktree-mount'
import {
  setActivityTerminalPortals,
  type ActivityTerminalPortalTarget
} from '@/components/activity/activity-terminal-portal'
import { useActivityTerminalPortalStatus } from '@/components/activity/activity-terminal-portal-status'
import NativeChatView from '@/components/native-chat/NativeChatView'
import {
  sameStructuredReadTarget,
  subscribeStructuredAttentionViews
} from '@/attention/agent-subject-read-actions'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { useLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import {
  useLocalTaskSessionPanel,
  localTaskSessionPanelStore
} from '@/local-tasks/local-task-session-panel-store'
import {
  planLocalTaskSessionPortal,
  resolveLocalTaskSessionPaneKey
} from '@/local-tasks/local-task-session-panel-portal'
import { selectLocalTaskSessionTabLabel } from '@/local-tasks/local-task-session-tab-label'
import {
  acknowledgeLocalTaskSessionItems,
  revealLocalTaskSession
} from '@/local-tasks/local-task-session-reveal'
import { localTaskSessionPanelIsOnScreen } from '@/local-tasks/local-task-session-panel-read'
import { localTaskDescendantIds } from '../../../../shared/local-tasks/local-task-tree'

function relatedSessions(
  taskId: string,
  tasks: readonly { id: string; parentId: string | null }[],
  sessions: readonly LocalTaskSessionLink[]
): LocalTaskSessionLink[] {
  const children = new Map<string, { id: string; parentId: string | null }[]>()
  for (const task of tasks) {
    if (task.parentId) {
      children.set(task.parentId, [...(children.get(task.parentId) ?? []), task])
    }
  }
  const ids = new Set([taskId, ...localTaskDescendantIds(taskId, children)])
  return sessions.filter((session) => ids.has(session.taskId))
}

function LocalTaskSessionPanelContent({
  session,
  requestToken
}: {
  session: LocalTaskSessionLink
  requestToken: string
}): React.JSX.Element {
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null)
  const publishedPortal = useRef<ActivityTerminalPortalTarget | null>(null)
  const readSurface = useRef<HTMLDivElement | null>(null)
  const chatViewObserved = useRef(false)
  const tabId = session.paneKey
    ? (parsePaneKey(session.paneKey)?.tabId ?? session.tabId)
    : session.tabId
  const inContact = useLocalTaskHostInContact(session.hostId)
  const terminalLayout = useAppStore((state) =>
    tabId ? state.terminalLayoutsByTabId[tabId] : undefined
  )
  const paneKey =
    resolveLocalTaskSessionPaneKey(session, terminalLayout) ??
    (!inContact &&
    publishedPortal.current?.requestToken === requestToken &&
    publishedPortal.current.tabId === tabId
      ? publishedPortal.current.paneKey
      : null)
  const chatTab = useAppStore((state) =>
    session.worktreeId
      ? (state.unifiedTabsByWorktree[session.worktreeId] ?? []).find(
          (tab) =>
            tab.contentType === 'agent-session' &&
            (tab.id === session.tabId || (session.sessionId && tab.entityId === session.sessionId))
        )
      : undefined
  )
  const chatOwner = useAppStore((state) =>
    chatTab && chatTab.contentType === 'agent-session'
      ? structuredAgentSessionOwnerForTab(state, chatTab)
      : null
  )
  const chatTarget = useMemo(() => structuredAgentSessionTargetForHost(chatOwner), [chatOwner])
  const isChat =
    session.surface === 'chat' && chatTab?.contentType === 'agent-session' && chatTarget
  const terminalAvailable = Boolean(session.worktreeId && tabId && paneKey)
  const portalStatus = useActivityTerminalPortalStatus(
    portalTarget,
    !isChat && inContact ? paneKey : null,
    false
  )

  const acknowledgeVisible = useCallback(() => {
    if (
      inContact &&
      (isChat ? chatViewObserved.current : terminalAvailable && portalStatus === 'ready') &&
      localTaskSessionPanelIsOnScreen(readSurface.current)
    ) {
      acknowledgeLocalTaskSessionItems(session.id)
    }
  }, [inContact, isChat, portalStatus, session.id, terminalAvailable])

  useLayoutEffect(() => {
    chatViewObserved.current = false
    if (!isChat || !chatTab || !chatTarget || !inContact) {
      return
    }
    return subscribeStructuredAttentionViews((read) => {
      if (
        read.sessionId === chatTab.entityId &&
        sameStructuredReadTarget(read.target, chatTarget)
      ) {
        chatViewObserved.current = true
        acknowledgeVisible()
      }
    })
  }, [acknowledgeVisible, chatTab, chatTarget, inContact, isChat, requestToken])

  useEffect(() => {
    acknowledgeVisible()
    const onPresence = (): void => acknowledgeVisible()
    window.addEventListener('focus', onPresence)
    window.addEventListener('pointerup', onPresence)
    window.addEventListener('keyup', onPresence)
    document.addEventListener('visibilitychange', onPresence)
    return () => {
      window.removeEventListener('focus', onPresence)
      window.removeEventListener('pointerup', onPresence)
      window.removeEventListener('keyup', onPresence)
      document.removeEventListener('visibilitychange', onPresence)
    }
  }, [acknowledgeVisible])

  useLayoutEffect(() => {
    const candidate =
      !isChat && terminalAvailable && portalTarget && session.worktreeId && tabId && paneKey
        ? {
            slotId: 'local-task-session',
            requestToken,
            target: portalTarget,
            worktreeId: session.worktreeId,
            tabId,
            paneKey
          }
        : null
    const plan = planLocalTaskSessionPortal(candidate, inContact, publishedPortal.current)
    if (
      (plan.requestMount || (!candidate && !isChat && inContact)) &&
      session.worktreeId &&
      tabId
    ) {
      requestBackgroundTerminalWorktreeMount({ worktreeId: session.worktreeId, tabIds: [tabId] })
    }
    publishedPortal.current = plan.descriptor
    setActivityTerminalPortals(plan.descriptor ? [plan.descriptor] : [])
  }, [
    inContact,
    isChat,
    paneKey,
    portalTarget,
    requestToken,
    session.worktreeId,
    tabId,
    terminalAvailable
  ])

  useEffect(() => () => setActivityTerminalPortals([]), [])

  return (
    <div ref={readSurface} className="relative flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex min-h-0 flex-1 flex-col" inert={!inContact}>
        {isChat && chatTab && chatTarget ? (
          <NativeChatView
            mode="structured"
            tabId={chatTab.id}
            sessionId={chatTab.entityId}
            agent={chatTab.agentSessionAgent!}
            target={chatTarget}
            isVisible={inContact}
            isFocusedGroup={inContact}
          />
        ) : (
          <div ref={setPortalTarget} className="relative min-h-0 flex-1 overflow-hidden" />
        )}
      </div>
      {!inContact ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-sm text-muted-foreground">
          {translate('localTasks.sessionPanel.disconnected', 'Not connected')}
        </div>
      ) : !isChat && !terminalAvailable ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {translate('localTasks.sessionPanel.unavailable', 'Session unavailable')}
        </div>
      ) : !isChat && portalStatus === 'unavailable' ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {translate('localTasks.sessionPanel.unverifiable', 'Cannot confirm session')}
        </div>
      ) : null}
    </div>
  )
}

export function LocalTaskSessionPanelSlot(): React.JSX.Element | null {
  const mode = useLocalTaskSessionPanel((state) => state.mode)
  const sessionLinkId = useLocalTaskSessionPanel((state) => state.sessionLinkId)
  const taskId = useLocalTaskSessionPanel((state) => state.taskId)
  const requestToken = useLocalTaskSessionPanel((state) => state.requestToken)
  const activeView = useAppStore((state) => state.activeView)
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const allSessions = useLocalTasksDomain((state) => state.links.sessions)
  const session = allSessions.find((candidate) => candidate.id === sessionLinkId)
  const name = useAppStore((state) =>
    session ? selectLocalTaskSessionTabLabel(state, session) : null
  )
  const options = useMemo(
    () => (taskId ? relatedSessions(taskId, tasks, allSessions) : []),
    [allSessions, taskId, tasks]
  )

  useEffect(() => {
    if (activeView === 'activity' || (mode !== 'closed' && !session)) {
      localTaskSessionPanelStore.getState().close()
      setActivityTerminalPortals([])
    }
  }, [activeView, mode, session])

  useEffect(() => {
    if (mode === 'closed') {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        localTaskSessionPanelStore.getState().close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode])

  useLayoutEffect(() => {
    if (mode !== 'closed') {
      window.dispatchEvent(new Event(SYNC_FIT_PANES_EVENT))
    }
  }, [mode])

  const setRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      setActivityTerminalPortals([])
    }
  }, [])

  if (mode === 'closed' || !session || !requestToken || activeView === 'activity') {
    return null
  }

  return (
    <div
      ref={setRef}
      className={
        mode === 'wide'
          ? 'absolute inset-y-0 right-0 z-30 flex w-2/3 min-w-0 flex-col border-l border-border bg-background shadow-floating'
          : 'relative z-20 flex w-[420px] max-w-[60%] shrink-0 flex-col border-l border-border bg-background'
      }
      aria-label={translate('localTasks.sessionPanel.title', 'Session preview')}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        {options.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="min-w-0 flex-1 justify-start"
                aria-label={translate('localTasks.sessionPanel.switchSession', 'Switch session')}
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {name ?? session.agent ?? session.id}
                </span>
                <ChevronDown className="size-3 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {options.map((candidate) => (
                <DropdownMenuItem
                  key={candidate.id}
                  onSelect={() => localTaskSessionPanelStore.getState().switchSession(candidate)}
                >
                  {candidate.id === session.id
                    ? (name ?? candidate.agent ?? candidate.id)
                    : (candidate.agent ?? candidate.id)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-foreground">
            {name ?? session.agent ?? translate('localTasks.sessionPanel.title', 'Session preview')}
          </span>
        )}
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={
            mode === 'wide'
              ? translate('localTasks.sessionPanel.narrow', 'Narrow')
              : translate('localTasks.sessionPanel.widen', 'Widen')
          }
          onClick={() =>
            localTaskSessionPanelStore.getState().setMode(mode === 'wide' ? 'narrow' : 'wide')
          }
        >
          {mode === 'wide' ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={translate('localTasks.sessionPanel.fullscreen', 'Full screen')}
          onClick={() => {
            localTaskSessionPanelStore.getState().close()
            if (!revealLocalTaskSession(session)) {
              localTaskSessionPanelStore.getState().open(session, mode)
            }
          }}
        >
          <PanelRightClose className="size-4" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={translate('localTasks.sessionPanel.close', 'Close')}
          onClick={() => localTaskSessionPanelStore.getState().close()}
        >
          <X className="size-4" />
        </Button>
      </div>
      <LocalTaskSessionPanelContent session={session} requestToken={requestToken} />
    </div>
  )
}
