import { describe, expect, it, vi } from 'vitest'
import { getDefaultWorkspaceSession } from '../../shared/constants'
import type { LocalTaskSessionLink } from '../../shared/local-tasks/local-task-link-types'
import {
  prepareLocalTaskTerminalPreview,
  type LocalTaskTerminalPreviewSource
} from './local-task-terminal-preview'

const tabId = '0c130ee7-e1cb-4c04-a8eb-8d105f44956b'
const leafId = '0a072f38-8410-4bd1-81ac-8a3113ad9a85'
const paneKey = `${tabId}:${leafId}`

function fixture() {
  const link: LocalTaskSessionLink = {
    id: 'session-link',
    taskId: 'task',
    hostId: 'local',
    worktreeId: 'repo::/work',
    instanceId: null,
    surface: 'terminal',
    tabId,
    paneKey,
    sessionId: null,
    providerSession: null,
    agent: null,
    linkedVia: 'manual',
    openedAt: 1
  }
  const session = getDefaultWorkspaceSession()
  session.tabsByWorktree['repo::/work'] = [
    {
      id: tabId,
      ptyId: 'pty',
      worktreeId: 'repo::/work',
      title: 'Terminal',
      defaultTitle: 'Terminal',
      customTitle: null,
      color: null,
      sortOrder: 0,
      createdAt: 1
    }
  ]
  session.terminalLayoutsByTabId[tabId] = {
    root: { type: 'leaf', leafId },
    activeLeafId: leafId,
    expandedLeafId: null,
    ptyIdsByLeafId: { [leafId]: 'pty' }
  }
  session.terminalPtyIncarnationsByPaneKey = { [paneKey]: 'incarnation' }
  let current: ReturnType<LocalTaskTerminalPreviewSource['terminal']> = {
    handle: 'term_live',
    ptyId: 'pty',
    incarnationId: 'incarnation',
    worktreeId: 'repo::/work',
    paneKey,
    connected: true
  }
  const reveal = vi.fn().mockResolvedValue({
    tabId,
    identity: { worktreeId: 'repo::/work', tabId, leafId, ptyId: 'pty' }
  })
  const source: LocalTaskTerminalPreviewSource = {
    session: vi.fn(() => session),
    terminal: vi.fn(() => current),
    notifier: { revealTerminalSession: reveal },
    sshInContact: () => false
  }
  return {
    link,
    session,
    source,
    reveal,
    replace: (next: typeof current) => {
      current = next
    }
  }
}

describe('task terminal preview preparation', () => {
  it('projects exactly the durable live pane without activation, focus or a new process', async () => {
    const f = fixture()
    expect(await prepareLocalTaskTerminalPreview(f.link, f.source)).toBe(true)
    expect(f.reveal).toHaveBeenCalledExactlyOnceWith('repo::/work', {
      ptyId: 'pty',
      tabId,
      leafId,
      title: 'Terminal',
      activate: false,
      focus: false,
      presentation: 'background',
      surfaceOwner: false,
      expectedProcessIdentity: { terminalHandle: 'term_live', incarnationId: 'incarnation' }
    })
  })

  it('does not read an out-of-contact SSH host or a paired host', async () => {
    const f = fixture()
    for (const hostId of ['ssh:offline', 'runtime:paired']) {
      expect(await prepareLocalTaskTerminalPreview({ ...f.link, hostId }, f.source)).toBe(false)
    }
    expect(f.source.session).not.toHaveBeenCalled()
    expect(f.source.terminal).not.toHaveBeenCalled()
    expect(f.reveal).not.toHaveBeenCalled()
  })

  it('does not recreate a deleted pane or adopt a mismatched worktree', async () => {
    const f = fixture()
    delete f.session.terminalLayoutsByTabId[tabId]
    expect(await prepareLocalTaskTerminalPreview(f.link, f.source)).toBe(false)
    const g = fixture()
    g.replace({
      handle: 'other',
      ptyId: 'pty',
      incarnationId: 'incarnation',
      worktreeId: 'other',
      paneKey,
      connected: true
    })
    expect(await prepareLocalTaskTerminalPreview(g.link, g.source)).toBe(false)
    expect(f.reveal).not.toHaveBeenCalled()
    expect(g.reveal).not.toHaveBeenCalled()
  })

  it('rejects a replacement incarnation arriving while the window projects the old one', async () => {
    const f = fixture()
    f.reveal.mockImplementation(async () => {
      f.replace({
        handle: 'term_live',
        ptyId: 'pty',
        incarnationId: 'replacement',
        worktreeId: 'repo::/work',
        paneKey,
        connected: true
      })
      return { tabId, identity: { worktreeId: 'repo::/work', tabId, leafId, ptyId: 'pty' } }
    })
    expect(await prepareLocalTaskTerminalPreview(f.link, f.source)).toBe(false)
  })

  it('rejects a window reply for a different pane and does not retry', async () => {
    const f = fixture()
    f.reveal.mockResolvedValue({
      tabId,
      identity: { worktreeId: 'repo::/work', tabId, leafId: 'other', ptyId: 'pty' }
    })
    expect(await prepareLocalTaskTerminalPreview(f.link, f.source)).toBe(false)
    expect(f.reveal).toHaveBeenCalledTimes(1)
  })

  it('uses the SSH host partition only while that host is connected', async () => {
    const f = fixture()
    f.source.sshInContact = () => true
    expect(
      await prepareLocalTaskTerminalPreview({ ...f.link, hostId: 'ssh:owned' }, f.source)
    ).toBe(true)
    expect(f.source.session).toHaveBeenCalledExactlyOnceWith('ssh:owned')
  })
})
