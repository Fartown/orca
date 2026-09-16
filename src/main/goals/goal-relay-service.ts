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
    userDataPath: process.env.ORCA_USER_DATA_PATH ?? join(homedir(), '.orca-relay')
  })
  dispatcher.onRequest('goals.status', async (raw, context) =>
    callers.run(context.clientId, async () => {
      GoalRpcParams['goals.status'].parse(raw)
      return {
        status: entryPath ? (hookReady ? 'ready' : 'degraded') : 'unavailable',
        reason: !entryPath ? 'driver-bundle-missing' : hookReady ? null : 'hook-start-failed',
        supports: { localTerminal: true, structured: false, ssh: true, wsl: false }
      }
    })
  )
  dispatcher.onRequest('goals.draftAcceptance', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.draftAcceptance'].parse(raw)
      return service.drafts.start(params)
    })
  )
  dispatcher.onRequest('goals.getAcceptanceDraft', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.getAcceptanceDraft'].parse(raw)
      return service.drafts.get(params.draftId)
    })
  )
  dispatcher.onRequest('goals.cancelAcceptanceDraft', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.cancelAcceptanceDraft'].parse(raw)
      return service.drafts.cancel(params.draftId)
    })
  )
  dispatcher.onRequest('goals.listEditorDrafts', async (raw, context) =>
    callers.run(context.clientId, async () => {
      GoalRpcParams['goals.listEditorDrafts'].parse(raw)
      return service.editorDrafts.list()
    })
  )
  dispatcher.onRequest('goals.getEditorDraft', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.getEditorDraft'].parse(raw)
      return service.editorDrafts.get(params.editorDraftId)
    })
  )
  dispatcher.onRequest('goals.saveEditorDraft', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.saveEditorDraft'].parse(raw)
      return service.editorDrafts.save(params)
    })
  )
  dispatcher.onRequest('goals.deleteEditorDraft', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.deleteEditorDraft'].parse(raw)
      return service.editorDrafts.delete(params)
    })
  )
  dispatcher.onRequest('goals.list', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.list'].parse(raw)
      return service.list(params)
    })
  )
  dispatcher.onRequest('goals.get', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.get'].parse(raw)
      return service.get(params.goalId)
    })
  )
  dispatcher.onRequest('goals.create', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.create'].parse(raw)
      return service.create(params)
    })
  )
  dispatcher.onRequest('goals.control', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.control'].parse(raw)
      return service.control(params)
    })
  )
  dispatcher.onRequest('goals.amend', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.amend'].parse(raw)
      return service.amend(params)
    })
  )
  dispatcher.onRequest('goals.rebind', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.rebind'].parse(raw)
      return service.rebind(params)
    })
  )
  dispatcher.onRequest('goals.archive', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.archive'].parse(raw)
      return service.archive(params)
    })
  )
  dispatcher.onRequest('goals.versions', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.versions'].parse(raw)
      return service.versions(params.goalId)
    })
  )
  dispatcher.onRequest('goals.adoptLegacy', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.adoptLegacy'].parse(raw)
      return service.adoptLegacy(params)
    })
  )
  dispatcher.onRequest('goals.operation', async (raw, context) =>
    callers.run(context.clientId, async () => {
      const params = GoalRpcParams['goals.operation'].parse(raw)
      return service.operation(params.clientOperationId)
    })
  )
  return () => service.drafts.dispose()
}
