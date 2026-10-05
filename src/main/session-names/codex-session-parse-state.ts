import {
  cloneSessionAccumulator,
  createAccumulator,
  sessionIdFromFileName
} from '../ai-vault/session-scanner-accumulator'
import type {
  CodexUsageSnapshot,
  FileWithMtime,
  SessionAccumulator
} from '../ai-vault/session-scanner-types'
import type { TranscriptMessageSink } from '../ai-vault/session-transcript-consumers'
import type { CodexNonUserOrigin } from '../ai-vault/session-scanner-codex-non-user-origin'

export type CodexSessionParseState = {
  accumulator: SessionAccumulator
  previousTotals: CodexUsageSnapshot | null
  /** Codex's own non-user classification (spawned agent, review, compaction); rejects the parse. */
  nonUserOrigin: CodexNonUserOrigin | null
  sawSessionMeta: boolean
  historyMode: string | null
  /** Kept for the legacy title; native evidence is retained separately. */
  titleSource: 'meta' | 'user' | null
}

export function createCodexParseState(
  file: FileWithMtime,
  messages?: TranscriptMessageSink
): CodexSessionParseState {
  return {
    accumulator: createAccumulator({
      agent: 'codex',
      file,
      sessionId: sessionIdFromFileName(file.path),
      messages
    }),
    previousTotals: null,
    nonUserOrigin: null,
    sawSessionMeta: false,
    historyMode: null,
    titleSource: null
  }
}

export function cloneCodexParseState(state: CodexSessionParseState): CodexSessionParseState {
  return { ...state, accumulator: cloneSessionAccumulator(state.accumulator) }
}
