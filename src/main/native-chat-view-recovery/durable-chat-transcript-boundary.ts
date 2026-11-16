import { createHash } from 'node:crypto'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { resolveObservedAgentStatusBinding } from '../ipc/agent-status-ipc-boundary'
import { resolveSessionFilePath } from '../native-chat/session-file-resolver'
import { transcriptFileStat } from '../native-chat/wsl-transcript-fs-access'
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
  expectedSessionId: string
) {
  const session = durableChatProviderSession(runtime, handle, expectedSessionId)
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
  return {
    sessionId: session.id,
    afterMessageId: result.messages.at(-1)?.id ?? null,
    afterByteOffset: (await transcriptFileStat(filePath, 'exact')).size,
    empty: result.messages.length === 0 && !result.hasMore,
    submittedAt: Date.now()
  }
}
