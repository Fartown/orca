// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.hoisted(() => vi.fn())
const host = vi.hoisted(() => ({ offline: false }))
vi.mock('@/lib/agent-message-send', () => ({ sendMessageToAgent: send }))
vi.mock('@/components/native-chat/use-native-chat-host-outage', () => ({
  useNativeChatHostOutage: () =>
    host.offline
      ? { kind: 'offline', environmentId: 'env-1', hostLabel: 'mirror', canReconnect: true }
      : null
}))
vi.mock('@/components/native-chat/use-native-chat-host-outage-notice', () => ({
  useNativeChatHostOutageNotice: (outage: { hostLabel: string } | null) =>
    outage
      ? {
          key: 'host-outage',
          kind: 'host',
          tone: 'warning',
          text: `${outage.hostLabel} is offline`
        }
      : null
}))

import { activeAgentNotesSendFailureMessage } from '@/lib/active-agent-note-send-result'
import {
  buildLocalTaskNeedsYouRows,
  localTaskItemClientKey
} from '@/local-tasks/local-task-needs-you-rows'
import {
  localTaskNeedsYouStore,
  useLocalTaskNeedsYou
} from '@/local-tasks/local-task-needs-you-store'
import { localTasksDomainStore, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import type {
  LocalTaskAttentionItem,
  LocalTaskSessionLink,
  LocalTaskSessionProgress
} from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskNeedsYouItem } from './LocalTaskNeedsYouItem'
import { LocalTaskReplyBox } from './LocalTaskReplyBox'

const LEAF = '11111111-1111-4111-8111-111111111111'

const item: LocalTaskAttentionItem = {
  key: `tab-1:${LEAF}@5`,
  taskId: 't-1',
  taskSessionId: 's-1',
  kind: 'unread-done',
  agent: 'claude',
  lastMessage: 'Done.',
  since: 5,
  replyable: true
}

const link: LocalTaskSessionLink = {
  id: 's-1',
  taskId: 't-1',
  hostId: 'local',
  worktreeId: 'repo::/w',
  instanceId: null,
  surface: 'terminal',
  tabId: 'tab-1',
  paneKey: `tab-1:${LEAF}`,
  sessionId: null,
  providerSession: null,
  agent: 'claude',
  linkedVia: 'start',
  openedAt: 1
}

function typeAndSend(text: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: 'Reply' }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

beforeEach(() => {
  send.mockReset()
  localTaskNeedsYouStore.setState({ drafts: {} })
  localTaskNeedsYouStore.getState().openReply(item)
})
afterEach(cleanup)

it('sends once to the session and keeps the words with the reason when it is not taken', async () => {
  send.mockResolvedValueOnce({ status: 'not-writable', code: 'session-send-refused' })
  render(<LocalTaskReplyBox item={item} link={link} movedOn={false} />)
  typeAndSend('Run the migration next')
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toBe(
      activeAgentNotesSendFailureMessage('not-writable', {
        explicitTarget: true,
        code: 'session-send-refused'
      })
    )
  )
  expect(send).toHaveBeenCalledOnce()
  expect(send).toHaveBeenCalledWith({
    worktreeId: 'repo::/w',
    target: { kind: 'terminal', tabId: 'tab-1', leafId: LEAF },
    prompt: 'Run the migration next'
  })
  expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveProperty(
    'value',
    'Run the migration next'
  )
})

it('closes the box once the agent took the reply', async () => {
  send.mockResolvedValueOnce({ status: 'sent' })
  render(<LocalTaskReplyBox item={item} link={link} movedOn={false} />)
  typeAndSend('Ship it')
  await waitFor(() =>
    expect(localTaskNeedsYouStore.getState().drafts[localTaskItemClientKey(item)]).toBeUndefined()
  )
})

it('does not answer a turn the session already moved past', () => {
  render(<LocalTaskReplyBox item={item} link={link} movedOn />)
  typeAndSend('Too late')
  expect(send).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveProperty('value', 'Too late')
})

describe('a reply whose host leaves contact (V02)', () => {
  const REMOTE = 'runtime:env-1'
  const remoteItem: LocalTaskAttentionItem = {
    ...item,
    taskId: `${REMOTE}/t-1`,
    taskSessionId: `${REMOTE}/s-1`
  }
  const remoteLink: LocalTaskSessionLink = { ...link, id: `${REMOTE}/s-1`, taskId: `${REMOTE}/t-1` }
  const remoteTask: LocalTask = {
    id: `${REMOTE}/t-1`,
    projectId: `${REMOTE}/p-1`,
    number: 1,
    ref: 'HOST-1',
    title: 'Serve host attention',
    description: '',
    criteria: [],
    statusId: 'status-1',
    priority: 0,
    labels: [],
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    revision: 0
  }
  const library = () => localTasksDomainStore.getState().writer(REMOTE)
  const judged = (state: LocalTaskSessionProgress['state'], items: LocalTaskAttentionItem[]) =>
    library().applyProgress({
      observedAt: 1,
      sessions: [
        {
          taskSessionId: remoteLink.id,
          state,
          lastMessage: 'stub finished',
          stateSince: 5,
          unread: items.length > 0
        }
      ],
      items
    })
  const setContact = (inContact: boolean): void => {
    host.offline = !inContact
    act(() => localTasksDomainStore.getState().setEndpointContact(REMOTE, inContact))
  }

  /** The view's own wiring: the host's judgment and the open drafts make the shown entry. */
  function NeedsYouEntry(): React.JSX.Element | null {
    const progress = useLocalTasksDomain((state) => state.progress)
    const drafts = useLocalTaskNeedsYou((state) => state.drafts)
    const [row] = buildLocalTaskNeedsYouRows({
      progress,
      drafts,
      tasksById: new Map([[remoteTask.id, remoteTask]]),
      scopeProjectId: null
    })
    const entry = row?.entries[0]
    return entry ? (
      <LocalTaskNeedsYouItem entry={entry} link={remoteLink} now={10} ownActions={false} />
    ) : null
  }

  const movedOn = () => screen.queryByText(/The session moved on/)
  const sendButton = () => screen.getByRole('button', { name: 'Send' })

  beforeEach(() => {
    host.offline = false
    localTaskNeedsYouStore.setState({ drafts: {} })
    localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
    localTasksDomainStore.getState().openEndpoint(REMOTE)
    library().applyLinks({ workspaces: [], sessions: [remoteLink] })
    judged('done', [remoteItem])
    localTaskNeedsYouStore.getState().openReply(remoteItem)
    render(<NeedsYouEntry />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Reply' }), {
      target: { value: 'offline retained words' }
    })
  })

  it('keeps the box usable under the host’s outage notice and never says the session moved on', async () => {
    setContact(false)
    expect(movedOn()).toBeNull()
    expect(screen.getByText('mirror is offline')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveProperty(
      'value',
      'offline retained words'
    )
    send.mockResolvedValueOnce({ status: 'status-unavailable', code: 'runtime-unverifiable' })
    fireEvent.click(sendButton())
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(send).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveProperty(
      'value',
      'offline retained words'
    )
  })

  it('reads a session its host cannot confirm as unconfirmed too, not moved on', () => {
    // The owning host lost its SSH target: its library stays in contact, the session cannot be judged.
    act(() => judged('unverifiable', []))
    expect(movedOn()).toBeNull()
    expect(sendButton()).toHaveProperty('disabled', false)
  })

  it('sends once contact returns and the host still lists the turn', async () => {
    setContact(false)
    setContact(true)
    act(() => judged('done', [remoteItem]))
    expect(movedOn()).toBeNull()
    send.mockResolvedValueOnce({ status: 'sent' })
    fireEvent.click(sendButton())
    await waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(send.mock.calls[0]?.[0]).toMatchObject({ prompt: 'offline retained words' })
  })

  it('says the session moved on only once the host’s new judgment drops the item', () => {
    setContact(false)
    expect(movedOn()).toBeNull()
    setContact(true)
    expect(movedOn()).toBeNull()
    act(() => judged('working', []))
    expect(movedOn()).toBeTruthy()
    expect(sendButton()).toHaveProperty('disabled', true)
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveProperty(
      'value',
      'offline retained words'
    )
  })
})
