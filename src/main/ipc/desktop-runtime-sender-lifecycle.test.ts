import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import SyncDatabase from '../sqlite/sync-database'
import { LocalTasksDatabase } from '../local-tasks/local-tasks-database'
import { LocalTasksService } from '../local-tasks/local-tasks-service'
import { RuntimeSubscriptionRegistry } from '../runtime/runtime-subscription-registry'
import { DesktopRuntimeSenderLifecycle } from './desktop-runtime-sender-lifecycle'

void SyncDatabase

function setup() {
  const subscriptions = new RuntimeSubscriptionRegistry()
  const registered: string[] = []
  const runtime = {
    registerSubscriptionCleanup(id: string, cleanup: () => void, connectionId?: string) {
      registered.push(id)
      subscriptions.register(id, cleanup, connectionId)
    },
    cleanupSubscription: (id: string) => subscriptions.cleanup(id),
    cleanupSubscriptionsForConnection: (connectionId: string) =>
      subscriptions.cleanupForConnection(connectionId)
  }
  const sender = Object.assign(new EventEmitter(), { id: 7 })
  const lifecycle = new DesktopRuntimeSenderLifecycle(runtime)
  const db = LocalTasksDatabase.openTransient()
  const service = new LocalTasksService(db, () => 1_000)
  const project = service.createProject({
    clientOperationId: 'project',
    name: 'Shop',
    prefix: 'shop'
  })
  if (!project.ok) {
    throw new Error(project.code)
  }
  service.registerDispatcher({ clientOperationId: 'register', paneKey: 'tab:pane' })
  const created = service.createProposal({
    clientOperationId: 'proposal',
    paneKey: 'tab:pane',
    items: [{ kind: 'start', title: 'Task', prompt: 'Work', target: { repoId: 'repo' } }]
  })
  if (!created.ok) {
    throw new Error(created.code)
  }
  service.decideProposal(
    { clientOperationId: 'decide', proposalId: created.proposal.id, decision: 'confirmed' },
    'desktop'
  )
  return {
    db,
    service,
    lifecycle,
    sender,
    runtime,
    subscriptions,
    registered,
    proposalId: created.proposal.id
  }
}

describe('desktop proposal claim document lifetime', () => {
  it.each(['did-navigate', 'render-process-gone', 'destroyed'])(
    'rejects a claim invoked after %s retired its connection',
    async (event) => {
      const { db, service, lifecycle, sender, runtime, registered, proposalId } = setup()
      try {
        const scope = lifecycle.callScopeFor(sender)
        let resume: (() => void) | undefined
        const admission = new Promise<void>((resolve) => {
          resume = resolve
        })
        const pending = admission.then(() =>
          service.claimProposal(
            { clientOperationId: 'claim', proposalId },
            scope.connectionId,
            runtime,
            scope.connectionSignal
          )
        )
        sender.emit(event)
        expect(scope.connectionSignal.aborted).toBe(true)
        resume?.()
        expect(await pending).toMatchObject({ ok: false, code: 'stale' })
        expect(registered).toEqual([])
        expect(service.dispatcher.proposalResult(proposalId)).toMatchObject({
          ok: true,
          proposal: { status: 'confirmed' }
        })
      } finally {
        db.close()
      }
    }
  )

  it('releases an active claim before its library closes', async () => {
    const { db, service, lifecycle, sender, runtime, subscriptions, proposalId } = setup()
    const scope = lifecycle.callScopeFor(sender)
    expect(
      service.claimProposal(
        { clientOperationId: 'claim', proposalId },
        scope.connectionId,
        runtime,
        scope.connectionSignal
      )
    ).toMatchObject({ ok: true, proposal: { executionActive: true } })
    expect(() => db.close()).not.toThrow()
    await expect(
      subscriptions.cleanupAndWait(`local-task-proposal-owner:${proposalId}`)
    ).resolves.toBeUndefined()
    sender.emit('destroyed')
  })
})
