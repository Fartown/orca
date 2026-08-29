import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@stablyai/playwright-test'
import type {
  ConversationDeletePreparation,
  RoundRecordPreview
} from '../../../src/shared/issues/types'
import { closeConversationPane, waitForConversation } from './issues-journey-actions'
import { listConversations, runtimeRpc } from './packaged-issues-journey'

export async function setCodexDefaultArgs(page: Page, args: string): Promise<void> {
  await page.evaluate(async (nextArgs) => {
    const store = window.__store
    if (!store) {
      throw new Error('E2E store unavailable')
    }
    const current = store.getState().settings?.agentDefaultArgs ?? {}
    await store.getState().updateSettings({
      agentDefaultArgs: { ...current, codex: nextArgs }
    })
  }, args)
}

export async function ensureJourneySshTarget(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const existing = (await window.api.ssh.listTargets()).find(
      (target) => target.label === 'Journey SSH'
    )
    const target =
      existing ??
      (
        await window.api.ssh.addTarget({
          target: {
            label: 'Journey SSH',
            host: '127.0.0.1',
            port: 65534,
            username: 'journey',
            relayGracePeriodSeconds: 60
          }
        })
      ).target
    const store = window.__store
    if (!store) {
      throw new Error('E2E store unavailable')
    }
    const labels = new Map(store.getState().sshTargetLabels)
    labels.set(target.id, target.label)
    store.getState().setSshTargetLabels(labels)
    return target.id
  })
}

export async function forgetAllConversations(page: Page): Promise<void> {
  for (const initial of await listConversations(page)) {
    if (initial.attachment.kind === 'attached') {
      await closeConversationPane(page, initial)
      await waitForConversation(
        page,
        (conversation) =>
          conversation.id === initial.id && conversation.attachment.kind === 'detached',
        30_000
      )
    }
    const rounds = await runtimeRpc<{
      status: 'snapshot-page'
      rounds: RoundRecordPreview[]
    }>(page, 'issues.listRounds', {
      mode: 'start',
      scope: { kind: 'conversation', conversationId: initial.id },
      limit: 200
    })
    for (const round of rounds.rounds.filter((candidate) => candidate.resolvedAt === null)) {
      await runtimeRpc(page, 'issues.resolveRound', {
        mutationId: randomUUID(),
        roundId: round.id
      })
    }
    const preparation = await runtimeRpc<ConversationDeletePreparation>(
      page,
      'conversations.prepareDelete',
      { conversationId: initial.id }
    )
    expect(preparation.blockers).toEqual([])
    expect(preparation.preflightToken).not.toBeNull()
    await runtimeRpc(page, 'conversations.delete', {
      mutationId: randomUUID(),
      conversationId: initial.id,
      expectedRecordRevision: preparation.conversation.recordRevision,
      preflightToken: preparation.preflightToken
    })
  }
}
