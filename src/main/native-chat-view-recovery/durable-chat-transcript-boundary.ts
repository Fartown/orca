import { createHash } from 'node:crypto'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { resolveObservedAgentStatusBinding } from '../ipc/agent-hooks/agent-status-ipc-boundary'
import { resolveSessionFilePath } from '../native-chat/session-file-resolver'
import {
  boundaryFingerprint,
  readTranscriptFileVersion,
  transcriptFileVersionChanged
} from '../native-chat/transcript-watching/transcript-file-version'
import { readNativeChatTranscriptTail } from '../native-chat/transcript-tail-reader'

export type DurableChatSessionRuntime = Pick<
  OrcaRuntimeService,
  | 'getOrchestrationDispatchAuthority'
  | 'getExactWorkerProviderSession'
  | 'getAgentProviderSessionRows'
  | 'readObservedAgentStatusPaneIdentityFn'
  | 'getAgentStatusTerminalHandleForPaneKey'
  | 'getAgentStatusOrchestrationContextForPaneKey'
  | 'getTerminalProcessIncarnation'
>

export function durableChatProviderSession(
  runtime: DurableChatSessionRuntime,
  handle: string,
  expectedSessionId: string
) {
  const exact = runtime.getExactWorkerProviderSession(handle, 0)
  if (!exact || exact.agent !== 'codex' || exact.providerSession.id !== expectedSessionId) {
    throw new Error('terminal_handle_stale')
  }
  const live = runtime
    .getAgentProviderSessionRows()
    .find(
      (row) =>
        row.paneKey === exact.paneKey &&
        row.agentType === 'codex' &&
        row.receivedAt === exact.observedAt &&
        row.providerSession?.id === expectedSessionId &&
        row.restoredUnconfirmed !== true &&
        row.providerSessionOnly !== true
    )
  if (!live) {
    throw new Error('terminal_handle_stale')
  }
  const observed = runtime.readObservedAgentStatusPaneIdentityFn(exact.paneKey)
  if (observed.kind === 'observed') {
    const binding = resolveObservedAgentStatusBinding(exact.paneKey, runtime, observed)
    if (
      binding.kind === 'unresolved' ||
      binding.processIncarnation !== runtime.getTerminalProcessIncarnation(handle)
    ) {
      throw new Error('terminal_handle_stale')
    }
  } else {
    const authority = runtime.getOrchestrationDispatchAuthority(handle)
    if (
      !live.launchToken ||
      !authority?.launchTokenHash ||
      authority.paneKey !== exact.paneKey ||
      authority.processIncarnation !== runtime.getTerminalProcessIncarnation(handle) ||
      createHash('sha256').update(live.launchToken).digest('hex') !== authority.launchTokenHash
    ) {
      throw new Error('terminal_handle_stale')
    }
  }
  return exact.providerSession
}

export async function captureDurableChatTranscriptBoundary(
  runtime: DurableChatSessionRuntime,
  handle: string,
  expectedSessionId: string,
  restoredAuthorityMatches = false
) {
  const { session, sessionUnverifiedAtSubmit } = durableChatSubmissionSession(
    runtime,
    handle,
    expectedSessionId,
    restoredAuthorityMatches
  )
  const filePath = session.transcriptPath ?? (await resolveSessionFilePath('codex', session.id))
  if (!filePath) {
    throw new Error('Chat transcript boundary is unavailable')
  }
  const result = await readNativeChatTranscriptTail({
    agent: 'codex',
    sessionId: session.id,
    filePath,
    limit: 64,
    sourceOrder: true
  })
  if ('error' in result) {
    throw new Error('Chat transcript boundary is unavailable')
  }
  const version = await readTranscriptFileVersion(filePath)
  const fingerprint = await boundaryFingerprint(filePath, version.size)
  if (transcriptFileVersionChanged(await readTranscriptFileVersion(filePath), version)) {
    throw new Error('Chat transcript changed during submission')
  }
  return {
    ...(sessionUnverifiedAtSubmit
      ? {
          sessionUnverifiedAtSubmit: true,
          submitPtyId: runtime.getOrchestrationDispatchAuthority(handle)?.ptyId
        }
      : {}),
    transcriptPath: filePath,
    fileIdentity: version.identity,
    boundaryFingerprint: fingerprint,
    sessionId: session.id,
    afterMessageId: result.messages.at(-1)?.id ?? null,
    afterByteOffset: version.size,
    empty: result.messages.length === 0 && !result.hasMore,
    submittedAt: Date.now()
  }
}

export function durableChatSubmissionSession(
  runtime: DurableChatSessionRuntime,
  handle: string,
  expectedSessionId: string,
  restoredAuthorityMatches: boolean
) {
  try {
    return {
      session: durableChatProviderSession(runtime, handle, expectedSessionId),
      sessionUnverifiedAtSubmit: false
    }
  } catch (error) {
    if (!restoredAuthorityMatches) {
      throw error
    }
    const authority = runtime.getOrchestrationDispatchAuthority(handle)
    const exact = runtime.getExactWorkerProviderSession(handle, 0)
    if (!authority?.paneKey || (exact && exact.providerSession.id !== expectedSessionId)) {
      throw error
    }
    const observed = runtime.readObservedAgentStatusPaneIdentityFn(authority.paneKey)
    if (observed.kind === 'observed') {
      const binding = resolveObservedAgentStatusBinding(authority.paneKey, runtime, observed)
      if (
        binding.kind === 'unresolved' ||
        binding.processIncarnation !== authority.processIncarnation
      ) {
        throw error
      }
    }
    const row = runtime
      .getAgentProviderSessionRows()
      .find((entry) => entry.paneKey === authority.paneKey && entry.agentType === 'codex')
    if (row?.providerSession?.id !== expectedSessionId) {
      throw error
    }
    return { session: row.providerSession, sessionUnverifiedAtSubmit: true }
  }
}
