import type {
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult,
  AiVaultSessionTitle
} from '../../../shared/ai-vault-session-title'
import { isAiVaultTitleAgent } from '../../../shared/ai-vault-session-title'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import {
  projectSessionNameSlot,
  sessionNameSlotEqual
} from '../../../shared/session-names/session-name-slot'
import { canonicalSessionTitleKey } from '../lib/canonical-session-titles'
import { settleAiVaultTitleRequestBatches } from '../lib/ai-vault-tab-title-batches'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { hasIndependentScannedSessionIdentity } from './scanned-session-name-identity'

import {
  createPendingSessionNameRead,
  createSessionNameReadSnapshot,
  type PendingSessionNameRead,
  type SessionNameRequest
} from './session-name-read-snapshot'
export type { SessionNameRequest } from './session-name-read-snapshot'
const REFRESH_MS = 20_000
const NAMED_REFRESH_MS = 5 * 60_000
const MAX_RECORDS = 4_096
const keyOf = (request: SessionNameRequest) =>
  canonicalSessionTitleKey(request.executionHostId, request.agent, request.sessionId)

/** A renderer projection cache; identities are supplied by their existing owners. */
export function createSessionNameStore(
  resolve: (args: AiVaultSessionTitlesArgs) => Promise<AiVaultSessionTitlesResult>
) {
  let records: ReadonlyMap<string, AiVaultSessionTitle> = new Map()
  const listeners = new Set<() => void>()
  const lastReads = new Map<string, { at: number; path?: string }>()
  const inFlight = new Map<string, PendingSessionNameRead>()
  const pending = new Map<string, PendingSessionNameRead>()
  let flushQueued = false
  let epoch = 0
  const watchers = new Map<number, readonly SessionNameRequest[]>()
  let nextWatcher = 0
  let watchTimer: ReturnType<typeof setInterval> | undefined
  const notify = () => listeners.forEach((listener) => listener())

  function publish(executionHostId: ExecutionHostId, result: AiVaultSessionTitlesResult): void {
    const titles = new Map(
      result.titles.map((title) => [`${title.agent}\0${title.sessionId}`, title])
    )
    const evidence = new Map(
      (result.nameEvidence ?? []).map((item) => [`${item.agent}\0${item.sessionId}`, item])
    )
    let next: Map<string, AiVaultSessionTitle> | undefined
    for (const identity of new Set([...titles.keys(), ...evidence.keys()])) {
      const title = titles.get(identity)
      const observation = evidence.get(identity)
      const item = title ?? observation!
      const key = canonicalSessionTitleKey(executionHostId, item.agent, item.sessionId)
      const slot = projectSessionNameSlot({
        agent: item.agent,
        sessionId: item.sessionId,
        previous: records.get(key),
        title,
        evidence: observation,
        manualTitle: null
      })
      if (slot && !sessionNameSlotEqual(records.get(key), slot)) {
        next ??= new Map(records)
        next.delete(key)
        next.set(key, slot)
      }
    }
    if (!next) {
      return
    }
    while (next.size > MAX_RECORDS) {
      const oldest = next.keys().next().value!
      next.delete(oldest)
      lastReads.delete(oldest)
    }
    records = next
    notify()
  }

  async function flush(): Promise<void> {
    flushQueued = false
    const batch = [...pending.values()]
    pending.clear()
    await settleAiVaultTitleRequestBatches(batch, async (requests) => {
      const host = requests[0]!.executionHostId
      let result: AiVaultSessionTitlesResult
      try {
        result = await resolve({
          executionHostScope: host,
          requests: requests.map(({ agent, sessionId, transcriptPath }) => ({
            agent,
            sessionId,
            ...(transcriptPath ? { transcriptPath } : {})
          }))
        })
      } catch {
        result = {
          titles: [],
          nameEvidence: requests.map(({ agent, sessionId }) => ({
            agent,
            sessionId,
            providerName: { kind: 'unavailable' }
          }))
        }
      }
      if (requests[0]!.epoch === epoch) {
        const wanted = new Set(
          requests
            .filter((request) => inFlight.get(keyOf(request)) === request)
            .map((request) => `${request.agent}\0${request.sessionId}`)
        )
        publish(host, {
          titles: result.titles.filter((title) => wanted.has(`${title.agent}\0${title.sessionId}`)),
          nameEvidence: result.nameEvidence?.filter((item) =>
            wanted.has(`${item.agent}\0${item.sessionId}`)
          )
        })
      }
      for (const request of requests) {
        const key = keyOf(request)
        if (inFlight.get(key) === request) {
          lastReads.set(key, { at: Date.now(), path: request.transcriptPath })
          while (lastReads.size > MAX_RECORDS) {
            lastReads.delete(lastReads.keys().next().value!)
          }
          inFlight.delete(key)
        }
        request.settleResult(request.epoch === epoch ? result : { titles: [] })
        request.done()
      }
    })
  }

  async function read(requests: readonly SessionNameRequest[], force = false): Promise<void> {
    const waits: Promise<void>[] = []
    for (const request of requests) {
      const key = keyOf(request)
      const existing = inFlight.get(key)
      if (existing) {
        waits.push(
          existing.transcriptPath === request.transcriptPath || !request.transcriptPath
            ? existing.promise
            : existing.promise.then(() =>
                existing.epoch === epoch ? read([request], force) : undefined
              )
        )
        continue
      }
      const last = lastReads.get(key)
      const refreshMs =
        records.get(key)?.providerName?.kind === 'named' ? NAMED_REFRESH_MS : REFRESH_MS
      if (
        !force &&
        last &&
        (!request.transcriptPath || last.path === request.transcriptPath) &&
        Date.now() - last.at < refreshMs
      ) {
        continue
      }
      const item = createPendingSessionNameRead(request, epoch)
      inFlight.set(key, item)
      pending.set(key, item)
      waits.push(item.promise)
    }
    if (pending.size && !flushQueued) {
      flushQueued = true
      queueMicrotask(() => {
        void flush()
      })
    }
    await Promise.all(waits)
  }

  function watch(requests: readonly SessionNameRequest[]): { unsubscribe: () => void } {
    if (!requests.length) {
      return { unsubscribe: () => {} }
    }
    const watcher = nextWatcher++
    watchers.set(watcher, requests)
    void read(requests)
    watchTimer ??= setInterval(() => {
      void read([...watchers.values()].flat())
    }, REFRESH_MS)
    return {
      unsubscribe: () => {
        watchers.delete(watcher)
        if (!watchers.size) {
          clearInterval(watchTimer)
          watchTimer = undefined
        }
      }
    }
  }

  function seed(sessions: readonly AiVaultSession[]): void {
    const byHost = new Map<ExecutionHostId, AiVaultSessionTitle[]>()
    const refreshes: SessionNameRequest[] = []
    for (const session of sessions) {
      if (!isAiVaultTitleAgent(session.agent) || !hasIndependentScannedSessionIdentity(session)) {
        continue
      }
      const key = canonicalSessionTitleKey(
        session.executionHostId,
        session.agent,
        session.sessionId
      )
      const previous = records.get(key)
      // A changed scan requests confirmation; it cannot overwrite a newer exact read.
      if (previous) {
        if (
          (session.providerName?.kind === 'named' &&
            (previous.providerName?.kind !== 'named' ||
              previous.providerName.title !== session.providerName.title)) ||
          (!previous.generatedTitle && session.generatedTitle)
        ) {
          refreshes.push({
            executionHostId: session.executionHostId,
            agent: session.agent,
            sessionId: session.sessionId,
            transcriptPath: session.filePath
          })
        }
        continue
      }
      const titles = byHost.get(session.executionHostId) ?? []
      titles.push({
        agent: session.agent,
        sessionId: session.sessionId,
        title: session.title,
        providerName: session.providerName,
        generatedTitle: session.generatedTitle
      })
      byHost.set(session.executionHostId, titles)
    }
    for (const [host, titles] of byHost) {
      publish(host, { titles })
    }
    if (refreshes.length) {
      void read(refreshes, true)
    }
  }

  return {
    getSnapshot: () => records,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    publish,
    invalidate: (requests: readonly SessionNameRequest[]) => {
      for (const request of requests) {
        const key = keyOf(request)
        lastReads.delete(key)
        pending.get(key)?.settleResult({ titles: [] })
        pending.delete(key)
        const active = inFlight.get(key)
        inFlight.delete(key)
        active?.done()
      }
    },
    read,
    readSnapshot: createSessionNameReadSnapshot({
      getEpoch: () => epoch,
      getRecord: (request) => records.get(keyOf(request)),
      getInFlight: (request) => inFlight.get(keyOf(request)),
      read
    }),
    watch,
    seed,
    resolveSessionTitles: async (
      args: AiVaultSessionTitlesArgs
    ): Promise<AiVaultSessionTitlesResult> => {
      const host = args.executionHostScope ?? 'local'
      await read(args.requests.map((request) => ({ ...request, executionHostId: host })))
      return {
        titles: args.requests.flatMap(
          (request) => records.get(keyOf({ ...request, executionHostId: host })) ?? []
        )
      }
    },
    reset: () => {
      epoch++
      records = new Map()
      lastReads.clear()
      for (const read of inFlight.values()) {
        read.settleResult({ titles: [] })
        read.done()
      }
      inFlight.clear()
      pending.clear()
      watchers.clear()
      clearInterval(watchTimer)
      watchTimer = undefined
      notify()
    }
  }
}

export const sessionNameStore = createSessionNameStore((args) =>
  window.api.aiVault.resolveSessionTitles(args)
)
