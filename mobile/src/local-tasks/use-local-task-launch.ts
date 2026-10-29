import { useEffect, useState } from 'react'
import type { LocalTaskWorkspaceLink } from '../../../src/shared/local-tasks/local-task-link-types'
import { buildLocalTaskAgentPrompt } from '../../../src/shared/local-tasks/local-task-agent-prompt'
import { localTaskAncestors } from '../../../src/shared/local-tasks/local-task-tree'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { TuiAgent } from '../../../src/shared/tui-agent'
import type { MobileNewTabAgentOption } from '../session/mobile-new-tab-agent-options'
import type { LocalTasksApi } from './local-tasks-api'
import type { LocalTasksCopy } from './local-tasks-copy'
import {
  openLocalTaskSession,
  startLocalTaskInNewWorkspace,
  type LocalTaskLaunchOutcome
} from './local-task-agent-launch'
import type { LocalTaskSite } from './local-task-endpoint'
import { localTaskLaunchMessage } from './local-task-launch-message'
import { loadLocalTaskAgentOptions } from './local-task-agent-options'
import { readLocalTaskHostContact } from './local-task-host-contact'
import { createLocalTaskOperationIds } from './local-task-operation-ids'
import type { LocalTaskSetup } from './local-task-project-setups'
import { localTaskWorkspaceHref, localTaskWorkspaceRouteId } from './local-task-work-navigation'
import type { LocalTasksLibrary } from './use-local-tasks-library'

export type LocalTaskLaunchRequest =
  | {
      mode: 'start'
      /** The task the new workspace is linked to; any level may start (REQ-009). */
      workspaceTask: LocalTask
      sessionTask: LocalTask
      name: string
      setups: LocalTaskSetup[]
      setup: LocalTaskSetup
    }
  | { mode: 'session'; sessionTask: LocalTask; workspace: LocalTaskWorkspaceLink }

export type LocalTaskAgentChoices =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; agents: MobileNewTabAgentOption[] }

/** The host a request runs on, as the library's owner names it. */
function requestHostId(request: LocalTaskLaunchRequest): string {
  return request.mode === 'start' ? request.setup.ownerHostId : request.workspace.hostId
}

/**
 * Drives the launch sheet: agents for the chosen host, the send mode, and the launch itself. All of
 * it runs on the library's host, which owns the workspaces it links (D-008).
 */
export function useLocalTaskLaunch(args: {
  site: LocalTaskSite
  api: LocalTasksApi
  library: Pick<LocalTasksLibrary, 'tasks' | 'reload'>
  copy: LocalTasksCopy
  onNavigate: (href: string) => void
}) {
  const [request, setRequest] = useState<LocalTaskLaunchRequest | null>(null)
  const [agents, setAgents] = useState<LocalTaskAgentChoices>({ status: 'loading' })
  const [delivery, setDelivery] = useState<'submit' | 'draft'>('submit')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [ids] = useState(() => ({
    link: createLocalTaskOperationIds(),
    record: createLocalTaskOperationIds()
  }))
  const { site } = args
  const launchClient = site.client
  const target = request ? `${request.mode}:${requestHostId(request)}` : null
  const contactOf = (ownerHostId: string) =>
    readLocalTaskHostContact(site.client, site.endpoint, ownerHostId)
  const offlineNotice = (contact: { kind: string }, label: string) =>
    contact.kind === 'out-of-contact'
      ? args.copy.work.hostOffline(label)
      : args.copy.work.hostUnknown

  useEffect(() => {
    if (!request || !launchClient || !site.pairedClient) {
      return
    }
    const pairedClient = site.pairedClient
    let current = true
    setAgents({ status: 'loading' })
    const routeId = request.mode === 'session' ? localTaskWorkspaceRouteId(request.workspace) : null
    const hostId = requestHostId(request)
    void contactOf(hostId).then((contact) => {
      if (!current) {
        return
      }
      if (contact.kind !== 'in-contact') {
        setAgents({ status: 'failed' })
        return
      }
      void loadLocalTaskAgentOptions({
        client: pairedClient,
        launchClient,
        hostCapabilities: site.capabilities,
        target: routeId ? { kind: 'existing', routeId } : { kind: 'create', hostId }
      }).then(
        (options) => current && setAgents({ status: 'ready', agents: options }),
        () => current && setAgents({ status: 'failed' })
      )
    })
    return () => {
      current = false
    }
    // Why keyed on the target: a new setup asks its own host, the same one is not asked twice.
  }, [target, launchClient])

  const launch = async (agent: TuiAgent | null, hostLabel: string) => {
    const active = request
    if (!active || !launchClient || busy) {
      return
    }
    // Why: a workspace-only start (null agent) is only offered on the start path.
    if (agent === null && active.mode !== 'start') {
      return
    }
    setRequest(null)
    setNotice(null)
    const hostId = requestHostId(active)
    const contact = await contactOf(hostId)
    if (contact.kind !== 'in-contact') {
      setNotice(offlineNotice(contact, hostLabel))
      return
    }
    const tasksById = new Map(args.library.tasks.map((task) => [task.id, task]))
    const prompt = {
      text: buildLocalTaskAgentPrompt(
        active.sessionTask,
        localTaskAncestors(active.sessionTask, tasksById)
      ),
      delivery
    }
    setBusy(true)
    try {
      let outcome: LocalTaskLaunchOutcome
      if (active.mode === 'start') {
        outcome = await startLocalTaskInNewWorkspace({
          launchClient,
          hostCapabilities: site.capabilities,
          api: args.api,
          ids,
          workspaceTaskId: active.workspaceTask.id,
          sessionTaskId: active.sessionTask.id,
          setup: {
            hostId: active.setup.ownerHostId,
            repoId: active.setup.repoId,
            label: active.setup.label
          },
          name: active.name,
          agent,
          prompt
        })
      } else {
        if (agent === null) {
          return
        }
        outcome = await openLocalTaskSession({
          launchClient,
          hostCapabilities: site.capabilities,
          api: args.api,
          ids: ids.record,
          sessionTaskId: active.sessionTask.id,
          workspace: { hostId, routeId: localTaskWorkspaceRouteId(active.workspace) ?? '' },
          agent,
          prompt
        })
      }
      setNotice(localTaskLaunchMessage(args.copy, outcome))
      args.library.reload(['links'])
      if (
        outcome.kind === 'done' ||
        outcome.kind === 'session-not-recorded' ||
        outcome.kind === 'workspace-created'
      ) {
        const href = localTaskWorkspaceHref({
          hostId: site.hostId,
          endpoint: site.endpoint,
          link: {
            kind: 'git-worktree',
            worktreeId: outcome.worktreeId,
            folderWorkspaceId: null,
            hostId
          },
          paneKey: outcome.kind === 'workspace-created' ? null : outcome.paneKey
        })
        if (href) {
          args.onNavigate(href)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return {
    request,
    agents,
    delivery,
    busy,
    notice,
    open: async (next: LocalTaskLaunchRequest, hostLabel: string) => {
      setNotice(null)
      const contact = await contactOf(requestHostId(next))
      if (contact.kind !== 'in-contact') {
        setNotice(offlineNotice(contact, hostLabel))
        return
      }
      setRequest(next)
    },
    close: () => setRequest(null),
    chooseSetup: async (setup: LocalTaskSetup, hostLabel: string) => {
      const contact = await contactOf(setup.ownerHostId)
      if (contact.kind !== 'in-contact') {
        setNotice(offlineNotice(contact, hostLabel))
        setRequest(null)
        return
      }
      setRequest((previous) => (previous?.mode === 'start' ? { ...previous, setup } : previous))
    },
    toggleDelivery: () => setDelivery((value) => (value === 'submit' ? 'draft' : 'submit')),
    launch
  }
}

export type LocalTaskLaunchController = ReturnType<typeof useLocalTaskLaunch>
