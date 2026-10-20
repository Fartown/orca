import type { AgentSessionClaimedSpawnResult } from '../../../../shared/agent-session-host-authority'
import {
  recordTerminalLaunchStage,
  traceTerminalPtyAdmission
} from '../../../terminal-launch-diagnostics/launch-trace'
import { isTerminalLeafId, makePaneKey } from '../../../../shared/stable-pane-id'
import { isValidTerminalTabId } from '../../../../shared/terminal-tab-id'
import {
  makePaneSpawnReservationKey,
  paneSpawnReservationsByOwnerKey,
  rejectPaneSpawnReservation,
  reservePaneSpawn
} from '../pane/spawn-reservation'
import { resolveStablePaneOwner } from '../pane/stable-owner'
import { ptySizes } from '../delivery/visibility-state'
import type { PtyRuntimeControllerDeps } from './controller-deps'
import { adoptMaterializedRuntimePtySpawn } from './spawn-early'
import { prepareRuntimePtySpawn } from './spawn-preflight'
import { buildRuntimePtySpawnOptions } from './spawn-options'
import { executeRuntimePtySpawn } from './spawn-execute'
import { commitRuntimePtySpawn } from './spawn-commit'
import { createRuntimePtySpawnState, type RuntimePtySpawnArgs } from './spawn-state'
import {
  commitRuntimeSpawnHiddenDelivery,
  releaseRuntimeSpawnPreSpawnHiddenMark
} from './spawn-hidden-delivery'

function toRuntimeSpawnReply(result: {
  id: string
  incarnationId?: string
  wslDistro?: string | null
  stablePaneOwner?: { handle: string; tabId: string; leafId: string }
  agentSessionEnsure?: AgentSessionClaimedSpawnResult
}) {
  return {
    id: result.id,
    ...(result.incarnationId ? { incarnationId: result.incarnationId } : {}),
    ...(typeof result.wslDistro === 'string' ? { wslDistro: result.wslDistro } : {}),
    ...(result.stablePaneOwner ? { stablePaneOwner: result.stablePaneOwner } : {}),
    ...(result.agentSessionEnsure ? { agentSessionEnsure: result.agentSessionEnsure } : {})
  }
}

function restoreProvisionalPtySize(ctx: ReturnType<typeof createRuntimePtySpawnState>): void {
  if (ctx.sessionId === undefined) {
    return
  }
  const key = ctx.effectiveSessionAppId ?? ctx.sessionId
  if (ctx.hadSessionSizeBeforeAttach && ctx.sessionSizeBeforeAttach) {
    ptySizes.set(key, ctx.sessionSizeBeforeAttach)
  } else {
    ptySizes.delete(key)
  }
}

export async function spawnPtyFromRuntimeController(
  deps: PtyRuntimeControllerDeps,
  args: RuntimePtySpawnArgs
) {
  return traceTerminalPtyAdmission(args, () => spawnRecordedPty(deps, args))
}

async function spawnRecordedPty(deps: PtyRuntimeControllerDeps, args: RuntimePtySpawnArgs) {
  recordTerminalLaunchStage('pty-request', args)
  const ctx = createRuntimePtySpawnState(deps, args)
  if (!args.adoptedStablePane) {
    const leafId =
      typeof args.leafId === 'string' && isTerminalLeafId(args.leafId) ? args.leafId : null
    const paneKey =
      typeof args.worktreeId === 'string' &&
      typeof args.tabId === 'string' &&
      isValidTerminalTabId(args.tabId) &&
      args.tabId.length <= 512 &&
      leafId
        ? makePaneKey(args.tabId, leafId)
        : null
    const ownerKey = makePaneSpawnReservationKey(args.worktreeId, args.connectionId, paneKey)
    const existingOwner = paneKey
      ? resolveStablePaneOwner(
          deps.runtime,
          deps.store,
          paneKey,
          args.worktreeId,
          args.connectionId
        )
      : null
    if (ownerKey && !existingOwner && !paneSpawnReservationsByOwnerKey.has(ownerKey)) {
      ctx.paneSpawnReservationKey = ownerKey
      ctx.paneSpawnReservation = reservePaneSpawn(ownerKey)
    }
    recordTerminalLaunchStage('stable-pane-candidate', {
      ...args,
      candidatePtyId: existingOwner?.ptyId
    })
  }
  try {
    const materializedOrPromise = adoptMaterializedRuntimePtySpawn(ctx)
    const materialized =
      materializedOrPromise instanceof Promise ? await materializedOrPromise : materializedOrPromise
    if (materialized) {
      recordTerminalLaunchStage('adopt-materialized', {
        ...args,
        ptyId: materialized.id,
        incarnationId: materialized.incarnationId
      })
      return toRuntimeSpawnReply(materialized)
    }
    const earlyAdopt = await prepareRuntimePtySpawn(ctx)
    if (earlyAdopt) {
      recordTerminalLaunchStage('adopt-preflight', {
        ...args,
        ptyId: earlyAdopt.id,
        incarnationId: earlyAdopt.incarnationId
      })
      return toRuntimeSpawnReply(earlyAdopt)
    }
    const earlyReserved = await buildRuntimePtySpawnOptions(ctx).catch((error: unknown) => {
      restoreProvisionalPtySize(ctx)
      throw error
    })
    if (earlyReserved) {
      recordTerminalLaunchStage('adopt-reservation', {
        ...args,
        ptyId: earlyReserved.id,
        incarnationId: earlyReserved.incarnationId
      })
      return toRuntimeSpawnReply(earlyReserved)
    }
    await executeRuntimePtySpawn(ctx)
    const committed = await commitRuntimePtySpawn(ctx)
    commitRuntimeSpawnHiddenDelivery(ctx)
    recordTerminalLaunchStage('pty-committed', {
      ...args,
      ptyId: committed.id,
      incarnationId: committed.incarnationId,
      isReattach: ctx.result.isReattach
    })
    return toRuntimeSpawnReply(committed)
  } catch (err) {
    recordTerminalLaunchStage('pty-failed', {
      ...args,
      ptyId: ctx.result?.id ?? ctx.pendingRegistrationPtyId
    })
    releaseRuntimeSpawnPreSpawnHiddenMark(ctx)
    if (ctx.pendingRegistrationPtyId) {
      deps.runtime?.cancelPendingPtyRegistration?.(
        ctx.pendingRegistrationPtyId,
        ctx.rejectedRegistrationCandidate?.incarnationId
      )
      ctx.pendingRegistrationPtyId = null
    }
    // Why: once the reservation is created, any later throw — spawn
    // failure, persist failure, or a post-spawn helper such as
    // registerPty/rememberPaneKeyForPty/track — must settle it. Otherwise
    // it lingers in paneSpawnReservationsByOwnerKey and every future spawn
    // for this pane awaits a promise that never resolves. reject is a
    // no-op once the reservation has already resolved.
    rejectPaneSpawnReservation(ctx.paneSpawnReservationKey, ctx.paneSpawnReservation, err)
    throw err
  } finally {
    ctx.releaseWorktreeSpawn?.()
    ctx.finishTerminalInstall()
  }
}
