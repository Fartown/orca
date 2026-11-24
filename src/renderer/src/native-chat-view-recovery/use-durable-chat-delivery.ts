import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createNonSecureContextUuid as createBrowserUuid } from '../../../shared/identifiers/non-secure-context-uuid'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { useAppStore } from '@/store'
import { parseExecutionHostId } from '../../../shared/execution-host/execution-host'
import { getReachableRuntimeEnvironmentIds } from '../hooks/ipc-events/runtime-events/runtime-environment-subscription-selection'
import type { NativeChatMessage } from '../../../shared/native-chat/native-chat-types'
import type { NativeChatDeliveryNotice } from '../components/native-chat/messages/rows/NativeChatMessageRow'
import {
  durableChatPending,
  type DurableChatSend,
  type DurableChatSubmitRecord
} from '../../../shared/native-chat-view-recovery/durable-chat-submit'
import { pendingSendsAsMessages } from '../../../shared/native-chat/transcript/pending-sends/native-chat-pending-sends'
import { durableChatUserEvidence } from '../../../shared/native-chat-view-recovery/durable-chat-reconciliation'

function hostInContact(record: DurableChatSubmitRecord) {
  const state = useAppStore.getState()
  const host = parseExecutionHostId(record.executionHostId)
  return (
    host?.kind === 'local' ||
    (host?.kind === 'ssh'
      ? state.sshConnectionStates.get(host.targetId)?.status === 'connected'
      : host?.kind === 'runtime' &&
        getReachableRuntimeEnvironmentIds(state).includes(host.environmentId))
  )
}

export function useDurableChatDelivery(args: {
  paneKey: string
  agent: string
  session: { messages: NativeChatMessage[]; sessionId?: string | null }
}) {
  const [records, setRecords] = useState<DurableChatSubmitRecord[]>([])
  const [now, setNow] = useState(Date.now)
  const languageRevision = useUiLanguageRevision()
  const api = window.api?.nativeChat?.durableSubmit
  const enabled = args.agent === 'codex' && !!api
  const readRevision = useRef(0)
  const current = useRef(args)
  useLayoutEffect(() => {
    current.current = args
  }, [args])
  const refresh = useCallback(async () => {
    if (!api) {
      return []
    }
    const revision = ++readRevision.current
    const paneKey = args.paneKey
    const next = await api.list(paneKey)
    if (current.current.paneKey === paneKey && revision === readRevision.current) {
      setRecords(next)
    }
    return next
  }, [args.paneKey, api])

  useEffect(() => {
    if (!enabled || !api) {
      return
    }
    let disposed = false
    const queried = new Map<string, string>()
    const queryOnContact = (entries: DurableChatSubmitRecord[]) => {
      if (disposed) {
        return
      }
      const state = useAppStore.getState()
      for (const record of entries) {
        if (record.state === 'prepared' || record.state === 'confirmed') {
          continue
        }
        const contact = hostInContact(record)
        const epoch = record.environmentId
          ? (state.runtimeStatusByEnvironmentId.get(record.environmentId)?.hostContactEpoch ?? 0)
          : 0
        const key = `${contact}:${epoch}`
        if (queried.get(record.id) === key) {
          continue
        }
        queried.set(record.id, key)
        if (contact) {
          void api.query(record.id).catch(() => {})
        }
      }
    }
    let entries: DurableChatSubmitRecord[] = []
    let providerEdge = ''
    const update = () => {
      void refresh()
        .then((next) => {
          entries = next
          queryOnContact(entries)
        })
        .catch(() => {})
    }
    const unlisten = api.onChanged(update)
    const unsubscribe = useAppStore.subscribe(() => {
      queryOnContact(entries)
      const snapshot = current.current
      const row = useAppStore.getState().agentStatusByPaneKey.get(snapshot.paneKey)
      const edge = JSON.stringify([row?.turnStartedAt, row?.stateObservedAt, row?.state])
      if (edge === providerEdge) {
        return
      }
      providerEdge = edge
      if (
        snapshot.session.sessionId &&
        entries.some(
          (entry) =>
            entry.transcriptBoundary?.sessionUnverifiedAtSubmit &&
            entry.state !== 'confirmed' &&
            hostInContact(entry)
        )
      ) {
        const evidence = durableChatUserEvidence(snapshot.session.messages)
        if (evidence.length > 0) {
          void api
            .confirm(snapshot.paneKey, snapshot.session.sessionId, JSON.stringify(evidence))
            .catch(() => {})
        }
      }
    })
    update()
    return () => {
      disposed = true
      readRevision.current += 1
      unlisten()
      unsubscribe()
    }
  }, [enabled, refresh, api])

  useEffect(() => {
    const deadline = records.reduce(
      (earliest, record) =>
        record.sentAt + 20_000 > now ? Math.min(earliest, record.sentAt + 20_000) : earliest,
      Infinity
    )
    if (!Number.isFinite(deadline)) {
      return
    }
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, deadline - Date.now()))
    return () => clearTimeout(timer)
  }, [records, now])

  const evidenceJson = useMemo(
    () => JSON.stringify(durableChatUserEvidence(args.session.messages)),
    [args.session.messages]
  )
  useEffect(() => {
    if (!api || !args.session.sessionId || !records.some(hostInContact) || evidenceJson === '[]') {
      return
    }
    void api.confirm(args.paneKey, args.session.sessionId, evidenceJson).catch(() => {})
  }, [api, args.paneKey, args.session.sessionId, evidenceJson, records])

  const send: DurableChatSend = useCallback(
    async (input) => {
      if (!api) {
        throw new Error(
          'Reliable terminal Chat requires an updated desktop client; input has been kept'
        )
      }
      const snapshot = current.current
      if (!snapshot.session.sessionId) {
        throw new Error('Chat session is not ready; input has been kept')
      }
      const boundary = snapshot.session.messages.at(-1)
      const entry = {
        id: createBrowserUuid(),
        text: input.text,
        imagePaths: input.imagePaths,
        sentAt: Date.now(),
        afterMessageId: boundary?.id ?? null,
        afterMessageTimestamp: boundary?.timestamp ?? null
      }
      const record = await api.prepare({
        ...input,
        ...entry,
        reconcileRestoredSession: true,
        paneKey: snapshot.paneKey,
        sessionId: snapshot.session.sessionId,
        imagePaths: input.imagePaths,
        afterMessageId: entry.afterMessageId ?? null,
        afterMessageTimestamp: entry.afterMessageTimestamp ?? null
      })
      readRevision.current += 1
      if (current.current.paneKey === snapshot.paneKey) {
        setRecords((existing) => [...existing.filter((r) => r.id !== record.id), record])
      }
      void api.dispatch(record.id).catch(() => {})
    },
    [api]
  )

  const notices = useMemo(() => {
    const result = new Map<string, NativeChatDeliveryNotice>()
    for (const record of records) {
      if (record.state === 'confirmed') {
        continue
      }
      result.set(
        `pending:${record.id}`,
        record.state === 'prepared' || record.state === 'rejected'
          ? { text: translate('components.native-chat.messageNotSent', 'Message not sent') }
          : record.state === 'unconfirmed' ||
              record.sessionId !== args.session.sessionId ||
              now >= record.sentAt + 20_000
            ? {
                text: translate(
                  'components.native-chat.deliveryUnconfirmed',
                  'Delivery unconfirmed — check chat before retrying'
                )
              }
            : { sending: true }
      )
    }
    return result
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- translate reads current UI language.
  }, [records, args.session.sessionId, now, languageRevision])
  const pending = useMemo(
    () => records.filter((record) => record.state !== 'confirmed').map(durableChatPending),
    [records]
  )
  const messages = useMemo(() => pendingSendsAsMessages(pending, []), [pending])
  return {
    pending: enabled ? pending : [],
    messages: enabled ? messages : [],
    notices,
    send: enabled ? send : undefined
  }
}
