import { afterEach, describe, expect, it } from 'vitest'
// Why: the Bun runner only moves SQLite tests to Node when they import this directly.
import '../sqlite/sync-database'
import { readLocalTaskAttentionStates } from './local-task-attention-store'
import {
  disposeLocalTaskExecutionFixtures,
  LEAF,
  linkWorktree,
  NOW,
  op,
  recordTerminal,
  setup,
  SHOP
} from './local-task-execution.test-fixture'

afterEach(() => {
  disposeLocalTaskExecutionFixtures()
})

function linkedSession(context: ReturnType<typeof setup>, paneKey: string) {
  const owner = context.task('订单导出')
  linkWorktree(context.work, owner.id, `${SHOP}-${owner.number}`)
  return recordTerminal(context.work, owner.id, { paneKey })
}

function remoteSessions(context: ReturnType<typeof setup>, panes: readonly string[]) {
  const remote = context.task('远程')
  linkWorktree(context.work, remote.id, 'repo-shop::/home/me/shop', { hostId: 'ssh:mini' })
  return panes.map((paneKey) => {
    const recorded = context.work.recordSession(
      {
        clientOperationId: op(),
        taskId: remote.id,
        hostId: 'ssh:mini',
        surface: 'terminal',
        paneKey,
        linkedVia: 'start'
      },
      'desktop'
    )
    if (!recorded.ok) {
      throw new Error(recorded.code)
    }
    return recorded.session
  })
}

describe('host attention judgment over time and contact', () => {
  it('keeps a wait for the user listed past the stale window while its terminal runs (REQ-014)', () => {
    let now = NOW
    const context = setup({ clock: () => now })
    const { work, host } = context
    const panes = [`tab-a:${LEAF}`, `tab-b:${LEAF}`, `tab-c:${LEAF}`]
    const sessions = panes.map((paneKey) => linkedSession(context, paneKey))
    const approval = JSON.stringify({ approval: { tool: 'Bash', summary: 'rm -rf build' } })
    host.report(panes[0], { state: 'waiting', interactivePrompt: approval })
    host.report(panes[1], { state: 'blocked' })
    host.report(panes[2], { state: 'waiting' })
    const remotePane = `tab-r:${LEAF}`
    const [remote] = remoteSessions(context, [remotePane])
    host.report(remotePane, { state: 'waiting' })
    for (const paneKey of [panes[0], panes[1], remotePane]) {
      host.live.add(paneKey)
    }

    now = NOW + 31 * 60 * 1000
    const progress = work.getProgress()
    const stateOf = (id: string) =>
      progress.sessions.find((entry) => entry.taskSessionId === id)?.state
    expect(
      progress.items.map((item) => [
        sessions.findIndex((entry) => entry.id === item.taskSessionId),
        item.kind
      ])
    ).toEqual(
      expect.arrayContaining([
        [0, 'approval'],
        [1, 'blocked']
      ])
    )
    expect(progress.items).toHaveLength(2)
    // With no terminal left, the old wait decays as upstream reads it.
    expect(stateOf(sessions[2].id)).toBe('idle')
    // A host out of contact still says nothing it cannot confirm.
    expect(stateOf(remote.id)).toBe('unverifiable')
  })

  it('writes a seen or snooze mark for a session whose host is out of contact', () => {
    const context = setup()
    const { db, work, host } = context
    const panes = [`tab-r1:${LEAF}`, `tab-r2:${LEAF}`]
    const [seen, snoozed] = remoteSessions(context, panes)
    for (const paneKey of panes) {
      host.report(paneKey, { state: 'waiting' })
    }
    host.contact.add('ssh:mini')
    const keyOf = (taskSessionId: string) =>
      work.getProgress().items.find((item) => item.taskSessionId === taskSessionId)?.key ?? ''
    const [seenKey, snoozedKey] = [keyOf(seen.id), keyOf(snoozed.id)]
    host.contact.delete('ssh:mini')

    expect(
      work.acknowledge({ clientOperationId: op(), itemKey: seenKey, taskSessionId: seen.id })
    ).toEqual({ ok: true })
    expect(
      work.snooze({
        clientOperationId: op(),
        itemKey: snoozedKey,
        taskSessionId: snoozed.id,
        until: NOW + 60_000
      })
    ).toEqual({ ok: true })
    // Still never filed under another session.
    expect(
      work.acknowledge({ clientOperationId: op(), itemKey: snoozedKey, taskSessionId: seen.id })
    ).toEqual({ ok: false, code: 'attention_item_mismatch' })
    expect(readLocalTaskAttentionStates(db)).toEqual(
      new Map([
        [seenKey, { seenAt: NOW, snoozedUntil: null }],
        [snoozedKey, { seenAt: null, snoozedUntil: NOW + 60_000 }]
      ])
    )
    // Back in contact, both waits are still current and stay hidden as the user asked.
    host.contact.add('ssh:mini')
    expect(work.getProgress().items).toEqual([])
  })

  it('counts snoozed waits and waits on hosts out of contact as ones that may return', () => {
    const context = setup()
    const { work, host } = context
    const localPane = `tab-l:${LEAF}`
    const local = linkedSession(context, localPane)
    const remotePane = `tab-r:${LEAF}`
    const [remote] = remoteSessions(context, [remotePane])
    for (const paneKey of [localPane, remotePane]) {
      host.report(paneKey, { state: 'waiting' })
    }
    host.live.add(localPane)
    host.contact.add('ssh:mini')
    const keyOf = (taskSessionId: string) =>
      work.getProgress().items.find((item) => item.taskSessionId === taskSessionId)?.key ?? ''
    const [localKey, remoteKey] = [keyOf(local.id), keyOf(remote.id)]
    work.snooze({
      clientOperationId: op(),
      itemKey: localKey,
      taskSessionId: local.id,
      until: NOW + 60_000
    })
    host.contact.delete('ssh:mini')

    expect(work.getProgress().items).toEqual([])
    const mayReturn = work.attentionKeyMayReturn()
    expect([localKey, remoteKey, `${localPane}@1`, `tab-x:${LEAF}@1`].map(mayReturn)).toEqual([
      true,
      true,
      false,
      false
    ])
  })
})
