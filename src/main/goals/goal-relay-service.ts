import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { RelayDispatcher } from '../../relay/dispatcher'
import { GoalRpcParams } from '../../shared/goals/goal-control-contract'
import { GoalTerminalSnapshotSchema } from '../../shared/goals/goal-host-facts'
import { resolveGoalHome } from '../../shared/goals/goal-store-layout'
import { GoalControlService } from './goal-control-service'
import { createGoalDriverLauncher } from './goal-driver-launch'
import { GoalStore } from './goal-store'
import type { GoalHookFacts } from './goal-summary-projection'
import type { GoalTurnRow } from './goal-turn-evidence'

export function projectRelayGoalHookFacts(
  event: { payload: Pick<GoalTurnRow, 'state'>; providerSessionOnly?: boolean } | undefined
): GoalTurnRow[] {
  return event
    ? [
        {
          state: event.payload.state,
          stateStartedAt: null,
          providerSessionOnly: event.providerSessionOnly
        }
      ]
    : []
}

/** The relay owns every Goal file and child; callbacks only resolve existing client terminal handles. */
export function registerRelayGoals(
  dispatcher: Pick<RelayDispatcher, 'onRequest' | 'requestClient'>,
  hooks: GoalHookFacts,
  hookReady = true
): () => void {
  const callers = new AsyncLocalStorage<number>()
  // Why: the recovery scan has no request of its own; terminal handles resolve through the last
  // client that asked (the client polls goals.list), and not at all while none is connected.
  let lastCaller: number | undefined
  const hostFacts = (params: Record<string, unknown>) => {
    const caller = callers.getStore()
    if (caller === undefined) {
      throw new Error('The Goal caller is unavailable.')
    }
    return dispatcher.requestClient(caller, 'goals.hostFacts', params, { timeoutMs: 15_000 })
  }
  const candidate = join(__dirname, 'goal-driver.js')
  const entryPath = existsSync(candidate) ? candidate : null
  const service = new GoalControlService({
    store: new GoalStore(resolveGoalHome(process.env, homedir())),
    hooks,
    terminals: {
      showTerminal: async (handle) => {
        const facts = GoalTerminalSnapshotSchema.parse(
          await hostFacts({ kind: 'terminal', handle })
        )
        return { ...facts, executionHostId: 'local' }
      }
    },
    resolveDraftWorkspace: async (selector) => {
      const path = z
        .string()
        .min(1)
        .parse(await hostFacts({ kind: 'workspace', selector }))
      if (!(await stat(path)).isDirectory()) {
        throw new Error('The remote workspace directory is unavailable.')
      }
      return path
    },
    launcher: createGoalDriverLauncher({
      entryPath,
      env: {
        ORCA_GOAL_TERMINAL_BACKEND: 'ssh-cli',
        ORCA_BIN: join(
          homedir(),
          '.orca-relay',
          'bin',
          process.platform === 'win32' ? 'orca.exe' : 'orca'
        )
      }
    }),
    userDataPath: process.env.ORCA_USER_DATA_PATH ?? join(homedir(), '.orca-relay'),
    recoveryHostContext: async (pass) => {
      const caller = lastCaller
      if (caller === undefined) {
        return false
      }
      await callers.run(caller, pass)
      return true
    }
  })
  const onRequest: typeof dispatcher.onRequest = (method, handler) =>
    dispatcher.onRequest(method, (raw, context) => {
      const reconnected = lastCaller !== context.clientId
      lastCaller = context.clientId
      if (reconnected) {
        // A client just (re)connected: drivers that exited while nobody could reach them come back now.
        void service.recovery.scan()
      }
      return handler(raw, context)
    })
  onRequest('goals.status', async (raw, context) =>
    callers.run(context.clientId, async () => {
      GoalRpcParams['goals.status'].parse(raw)
      return {
        status: entryPath ? (hookReady ? 'ready' : 'degraded') : 'unavailable',
        reason: !entryPath ? 'driver-bundle-missing' : hookReady ? null : 'hook-start-failed',
        supports: { localTerminal: true, structured: false, ssh: true, wsl: false }
      }
    })
  )
  onRequest('goals.draftAcceptance', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.draftAcceptance'].parse(raw)
      return service.drafts.start(params)
    })
  )
  onRequest('goals.getAcceptanceDraft', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.getAcceptanceDraft'].parse(raw)
      return service.drafts.get(params.draftId)
    })
  )
  onRequest('goals.cancelAcceptanceDraft', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.cancelAcceptanceDraft'].parse(raw)
      return service.drafts.cancel(params.draftId)
    })
  )
  onRequest('goals.listEditorDrafts', async (raw, context) =>
    callers.run(context.clientId, async () => {
      GoalRpcParams['goals.listEditorDrafts'].parse(raw)
      return service.editorDrafts.list()
    })
  )
  onRequest('goals.getEditorDraft', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.getEditorDraft'].parse(raw)
      return service.editorDrafts.get(params.editorDraftId)
    })
  )
  onRequest('goals.saveEditorDraft', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.saveEditorDraft'].parse(raw)
      return service.editorDrafts.save(params)
    })
  )
  onRequest('goals.deleteEditorDraft', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.deleteEditorDraft'].parse(raw)
      return service.editorDrafts.delete(params)
    })
  )
  onRequest('goals.list', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.list'].parse(raw)
      return service.list(params)
    })
  )
  onRequest('goals.get', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.get'].parse(raw)
      return service.get(params.goalId)
    })
  )
  onRequest('goals.create', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.create'].parse(raw)
      return service.create(params)
    })
  )
  onRequest('goals.control', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.control'].parse(raw)
      return service.control(params)
    })
  )
  onRequest('goals.amend', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.amend'].parse(raw)
      return service.amend(params)
    })
  )
  onRequest('goals.rebind', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.rebind'].parse(raw)
      return service.rebind(params)
    })
  )
  onRequest('goals.archive', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.archive'].parse(raw)
      return service.archive(params)
    })
  )
  onRequest('goals.versions', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.versions'].parse(raw)
      return service.versions(params.goalId)
    })
  )
  onRequest('goals.adoptLegacy', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.adoptLegacy'].parse(raw)
      return service.adoptLegacy(params)
    })
  )
  onRequest('goals.operation', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.operation'].parse(raw)
      return service.operation(params.clientOperationId)
    })
  )
  service.recovery.start()
  return () => {
    service.recovery.stop()
    service.drafts.dispose()
  }
}
