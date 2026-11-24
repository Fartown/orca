import { waitForAiVaultScan } from '../../scan-lifecycle/ai-vault-scan-cancellation'
import { remoteSessionContentLines } from '../../transcripts/remote-session-content-lines'
import { openTranscriptReadStream } from '../../../native-chat/transcript-filesystem/wsl-transcript-fs-access'
import {
  isZstdTranscriptPath,
  zstdTranscriptStream
} from '../../../native-chat/transcript-streaming/transcript-zstd-decompression'
import { createInterface } from 'node:readline'
import type {
  AiVaultSession,
  AiVaultSessionTitleKind
} from '../../../../shared/ai-vault/contracts/ai-vault-types'
import { readCodexSessionIndexName } from './session-scanner-codex-title-index'
import {
  readProviderNameEvidence,
  retainConfirmedProviderName,
  type ProviderNameReader
} from '../../../../shared/session-names/session-name-contract'
import type { ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import {
  cloneCodexParseState,
  createCodexParseState,
  type CodexSessionParseState
} from '../../../session-names/codex-session-parse-state'
import {
  accumulatorSessionIdentity,
  finalizeSession,
  updateTimeline
} from '../../parsing/session-scanner-accumulator'
import {
  consumeCodexCompletedMessage,
  consumeCodexLegacyEventMessage,
  consumeCodexResponseMessage
} from './session-scanner-codex-message-records'
import type {
  CodexUsageSnapshot,
  FileWithMtime,
  ResumableParseFinalizeOptions,
  ResumableSessionParseState
} from '../../session-scanner-types'
import type { TranscriptMessageSink } from '../../transcripts/session-transcript-consumers'
import {
  addCodexUsage,
  normalizeCodexUsage,
  subtractCodexUsage
} from '../../parsing/session-scanner-token-values'
import { asRecord, extractGitBranch, extractModel } from '../../parsing/session-record-fields'
import { extractString } from '../../../../shared/text/trimmed-string'
import { parseJsonObject } from '../../parsing/session-json-object'
import { readCodexTimelineOnlyRecord } from './session-scanner-codex-record-fast-path'
import { extractCodexSessionMetadataTitle } from '../../../session-names/codex-session-metadata'
import { readCodexNonUserOrigin } from './session-scanner-codex-non-user-origin'
export async function parseCodexSessionFile(
  file: FileWithMtime,
  platform: NodeJS.Platform = process.platform,
  codexHome: string | null = null,
  executionHostId?: ExecutionHostId,
  messages?: TranscriptMessageSink
): Promise<AiVaultSession | null> {
  // readline decodes UTF-8 across chunk boundaries, so both streams stay binary.
  const raw = openTranscriptReadStream(file.path, {}, 'scan')
  const input = isZstdTranscriptPath(file.path) ? zstdTranscriptStream(raw) : raw
  const lines = createInterface({ input, crlfDelay: Infinity })
  try {
    return await parseCodexSessionLines({
      file,
      lines,
      platform,
      codexHome,
      executionHostId,
      messages,
      titleReader: (sessionId) => readCodexSessionIndexName(file.path, codexHome, sessionId)
    })
  } finally {
    // readline.close() leaves its input open; an abandoned zstd decoder would keep inflating.
    lines.close()
    input.destroy()
  }
}

export async function parseCodexSessionContent(args: {
  file: FileWithMtime
  content: string | AsyncIterable<string>
  platform?: NodeJS.Platform
  codexHome?: string | null
  executionHostId?: ExecutionHostId
  executionHostPlatform?: NodeJS.Platform | null
  readIndexedTitle?: ProviderNameReader
  signal?: AbortSignal
}): Promise<AiVaultSession | null> {
  return parseCodexSessionLines({
    file: args.file,
    lines: remoteSessionContentLines(args.content, args.signal),
    platform: args.platform ?? process.platform,
    codexHome: args.codexHome ?? null,
    executionHostId: args.executionHostId,
    executionHostPlatform: args.executionHostPlatform,
    titleReader: args.readIndexedTitle
  })
}

function consumeCodexRecordLine(state: CodexSessionParseState, line: string): void {
  if (state.nonUserOrigin) {
    return
  }
  const record = parseJsonObject(line)
  if (!record) {
    return
  }
  const { accumulator } = state
  updateTimeline(accumulator, extractString(record.timestamp))

  const payload = asRecord(record.payload)
  // Forks may copy parent metadata later; the first session_meta defines this thread.
  if (record.type === 'session_meta' && payload && !state.sawSessionMeta) {
    state.nonUserOrigin = readCodexNonUserOrigin(payload)
    if (state.nonUserOrigin) {
      return
    }
    state.sawSessionMeta = true
    state.historyMode = extractString(payload.history_mode)
    const sessionId = extractString(payload.id)
    if (sessionId) {
      accumulator.sessionId = sessionId
    }
    const metadataName = extractCodexSessionMetadataTitle(payload)
    if (metadataName) {
      accumulator.title = metadataName.title
      accumulator.providerName = { kind: 'named', ...metadataName }
      state.titleSource = 'meta'
    }
    accumulator.cwd = extractString(payload.cwd) ?? accumulator.cwd
    accumulator.branch = extractGitBranch(payload.git) ?? accumulator.branch
    return
  }

  if (record.type === 'turn_context' && payload) {
    accumulator.cwd = extractString(payload.cwd) ?? accumulator.cwd
    const model = extractModel(payload)
    if (model) {
      accumulator.model = model
    }
    return
  }

  if (!payload) {
    return
  }

  if (record.type === 'response_item') {
    if (state.historyMode === 'paginated') {
      return
    }
    if (consumeCodexResponseMessage(accumulator, payload, record.timestamp)) {
      state.titleSource = 'user'
    }
    return
  }

  if (record.type !== 'event_msg') {
    return
  }

  if (state.historyMode === 'paginated' && payload.type === 'item_completed') {
    if (consumeCodexCompletedMessage(accumulator, payload, record.timestamp)) {
      state.titleSource = 'user'
    }
    return
  }

  if (payload.type === 'user_message' || payload.type === 'agent_message') {
    if (consumeCodexLegacyEventMessage(accumulator, payload, record.timestamp)) {
      state.titleSource = 'user'
    }
    return
  }

  if (payload.type !== 'token_count') {
    return
  }

  const info = asRecord(payload.info)
  if (!info) {
    return
  }
  const totalUsage = normalizeCodexUsage(info.total_token_usage)
  const lastUsage = normalizeCodexUsage(info.last_token_usage)
  let delta: CodexUsageSnapshot | null = null
  if (totalUsage) {
    delta = subtractCodexUsage(totalUsage, state.previousTotals)
    state.previousTotals = totalUsage
  } else if (lastUsage) {
    delta = lastUsage
    state.previousTotals = state.previousTotals
      ? addCodexUsage(state.previousTotals, lastUsage)
      : lastUsage
  }
  if (delta) {
    accumulator.totalTokens += delta.totalTokens
  }
  const model = extractModel(payload)
  if (model) {
    accumulator.model = model
  }
}

async function finalizeCodexParseState(
  state: CodexSessionParseState,
  platform: NodeJS.Platform,
  args: {
    codexHome: string | null
    titleReader?: ProviderNameReader
    signal?: AbortSignal
    executionHostId?: ExecutionHostId
    executionHostPlatform?: NodeJS.Platform | null
  }
): Promise<AiVaultSession | null> {
  if (state.nonUserOrigin) {
    return null
  }
  // Finalize a snapshot: the live state keeps accumulating appended lines.
  const snapshot = cloneCodexParseState(state)
  snapshot.accumulator.providerName ??= { kind: 'absent' }
  snapshot.accumulator.generatedTitle ??= null
  // Recheck the signature-cached index: a title can arrive after the transcript stops growing.
  let titleKind: AiVaultSessionTitleKind =
    snapshot.titleSource === 'meta' && snapshot.accumulator.title ? 'named' : 'fallback'
  if (snapshot.sawSessionMeta) {
    const evidence = await waitForAiVaultScan(
      readProviderNameEvidence(
        args.titleReader,
        snapshot.accumulator.sessionId,
        'session_index.thread_name'
      ),
      args.signal
    )
    snapshot.accumulator.providerName = retainConfirmedProviderName(
      snapshot.accumulator.providerName,
      evidence
    )
    if (evidence.kind === 'named') {
      snapshot.accumulator.title = evidence.title
      titleKind = 'named'
    }
  }
  return finalizeSession(snapshot.accumulator, platform, {
    titleKind,
    codexHome: args.codexHome,
    executionHostId: args.executionHostId,
    executionHostPlatform: args.executionHostPlatform
  })
}

export function createCodexSessionResumeState(
  file: FileWithMtime,
  codexHome: string | null,
  messages?: TranscriptMessageSink
): ResumableSessionParseState {
  return codexResumeStateFromParseState(
    createCodexParseState(file, messages),
    codexHome,
    (sessionId) => readCodexSessionIndexName(file.path, codexHome, sessionId)
  )
}

function codexResumeStateFromParseState(
  state: CodexSessionParseState,
  codexHome: string | null,
  titleReader: ProviderNameReader
): ResumableSessionParseState {
  return {
    consumeLine: (line) => consumeCodexRecordLine(state, line),
    consumeLineBytes: (line) => {
      const timelineOnlyRecord = readCodexTimelineOnlyRecord(
        line,
        state.accumulator.messages.active && state.historyMode !== 'paginated'
      )
      if (timelineOnlyRecord) {
        updateTimeline(state.accumulator, timelineOnlyRecord.timestamp)
      } else {
        consumeCodexRecordLine(state, line.toString('utf8'))
      }
    },
    shouldStop: () => state.nonUserOrigin !== null,
    identity: () => accumulatorSessionIdentity(state.accumulator),
    clone: () =>
      codexResumeStateFromParseState(cloneCodexParseState(state), codexHome, titleReader),
    touchFile: (file) => {
      state.accumulator.modifiedAt = file.modifiedAt
    },
    finalize: (platform, options?: ResumableParseFinalizeOptions) =>
      finalizeCodexParseState(state, platform, { codexHome, titleReader, ...options })
  }
}

async function parseCodexSessionLines(args: {
  file: FileWithMtime
  lines: AsyncIterable<string> | Iterable<string>
  platform: NodeJS.Platform
  codexHome: string | null
  executionHostId?: ExecutionHostId
  executionHostPlatform?: NodeJS.Platform | null
  titleReader?: ProviderNameReader
  messages?: TranscriptMessageSink
}): Promise<AiVaultSession | null> {
  const state = createCodexParseState(args.file, args.messages)
  for await (const line of args.lines) {
    consumeCodexRecordLine(state, line)
    if (state.nonUserOrigin) {
      return null
    }
  }
  return finalizeCodexParseState(state, args.platform, {
    codexHome: args.codexHome,
    titleReader: args.titleReader,
    executionHostId: args.executionHostId,
    executionHostPlatform: args.executionHostPlatform
  })
}
