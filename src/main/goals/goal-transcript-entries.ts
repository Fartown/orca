// One transcript line → what the guard needs from it. Parsing reuses the native-chat
// decoders; this layer only decides what is conversation and what is machinery.
import { asRecord, parseJsonObject, timestampMs } from '../ai-vault/session-scanner-values'
import { decodeClaudeTranscriptLine } from '../native-chat/transcript-line-decoders-claude'
import { decodeCodexTranscriptLine } from '../native-chat/transcript-line-decoders-codex'
import {
  CODEX_EVENT_TURN_ABORTED,
  CODEX_EVENT_TURN_COMPLETE
} from '../native-chat/transcript-turn-markers'
import { isKnownHarnessInjectedUserTurnText } from '../../shared/harness-injected-user-turns'
import {
  NATIVE_CHAT_INTERRUPTED_STATUS_TEXT,
  isTextBlock,
  type NativeChatMessage
} from '../../shared/native-chat-types'

export type GoalTranscriptFamily = 'claude' | 'codex'

export type GoalTranscriptEntry =
  | { kind: 'human'; text: string; queued: boolean; at: number | null }
  | { kind: 'agent' | 'error'; text: string; at: number | null }
  | { kind: 'tools'; names: string[]; at: number | null }
  | { kind: 'interrupt' | 'turn-end' | 'compaction'; at: number | null }

// Claude splits a large terminal paste into chunks wrapped in these tags, sometimes mid-word.
const PASTED_CONTENT_TAG = /<\/?pasted_content(?:\s+id="[^"]*")?>/g
// Codex injects repo instructions and environment blocks as user-role messages.
const CODEX_INSTRUCTION_PREFIXES = ['# AGENTS.md instructions', '<INSTRUCTIONS>']
const WHOLLY_TAGGED = /^<([a-z_]+)[^>]*>[\s\S]*<\/\1>$/

export function goalTranscriptEntry(
  line: string,
  family: GoalTranscriptFamily
): GoalTranscriptEntry | null {
  const record = parseJsonObject(line)
  if (!record) {
    return null
  }
  const stamp = timestampMs(record.timestamp)
  const at = Number.isFinite(stamp) ? stamp : null
  return family === 'codex' ? codexEntry(line, record, at) : claudeEntry(line, record, at)
}

function codexEntry(
  line: string,
  record: Record<string, unknown>,
  at: number | null
): GoalTranscriptEntry | null {
  if (record.type === 'compacted') {
    return { kind: 'compaction', at }
  }
  const payloadType = asRecord(record.payload)?.type
  if (record.type === 'event_msg') {
    if (payloadType === CODEX_EVENT_TURN_COMPLETE) {
      return { kind: 'turn-end', at }
    }
    if (payloadType === CODEX_EVENT_TURN_ABORTED) {
      return { kind: 'interrupt', at }
    }
    // Words come from completed turn items: the response_item copies carry text shapes
    // the shared decoder skips, and injected instructions never become a UserMessage.
    return payloadType === 'item_completed'
      ? fromMessage(decodeCodexTranscriptLine(line, ''), at, isCodexInjectedText)
      : null
  }
  return record.type === 'response_item' && isCodexToolCall(payloadType)
    ? fromMessage(decodeCodexTranscriptLine(line, ''), at, isCodexInjectedText)
    : null
}

function isCodexToolCall(payloadType: unknown): boolean {
  return (
    payloadType === 'function_call' ||
    payloadType === 'custom_tool_call' ||
    payloadType === 'local_shell_call'
  )
}

function isCodexInjectedText(text: string): boolean {
  const trimmed = text.trim()
  return (
    CODEX_INSTRUCTION_PREFIXES.some((prefix) => trimmed.startsWith(prefix)) ||
    WHOLLY_TAGGED.test(trimmed)
  )
}

function claudeEntry(
  line: string,
  record: Record<string, unknown>,
  at: number | null
): GoalTranscriptEntry | null {
  if (record.type === 'system') {
    return record.subtype === 'turn_duration'
      ? { kind: 'turn-end', at }
      : record.subtype === 'compact_boundary'
        ? { kind: 'compaction', at }
        : null
  }
  if (record.type === 'attachment') {
    // Input typed while Claude is busy is recorded as a queued command, not a user row.
    // Task notifications queue this way too, with their own command mode.
    const attachment = asRecord(record.attachment)
    const prompt = attachment?.type === 'queued_command' ? attachment.prompt : null
    const mode = attachment?.commandMode
    return typeof prompt === 'string' &&
      (mode === undefined || mode === 'prompt') &&
      !isKnownHarnessInjectedUserTurnText(prompt)
      ? humanEntry(prompt, true, at)
      : null
  }
  if (record.type !== 'user' && record.type !== 'assistant') {
    return null
  }
  // Scheduled prompts, image companions and task notifications carry these markers.
  const origin = asRecord(record.origin)?.kind
  if (record.type === 'user' && (record.isMeta === true || (origin && origin !== 'human'))) {
    return null
  }
  const entry = fromMessage(decodeClaudeTranscriptLine(line, ''), at, () => false)
  return entry?.kind === 'agent' && record.isApiErrorMessage === true
    ? { kind: 'error', text: entry.text, at }
    : entry
}

function fromMessage(
  message: NativeChatMessage | null,
  at: number | null,
  isInjected: (text: string) => boolean
): GoalTranscriptEntry | null {
  if (!message) {
    return null
  }
  const text = message.blocks
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('\n')
    .trim()
  if (message.role === 'system') {
    return text === NATIVE_CHAT_INTERRUPTED_STATUS_TEXT ? { kind: 'interrupt', at } : null
  }
  if (message.role === 'user') {
    return text && !isKnownHarnessInjectedUserTurnText(text) && !isInjected(text)
      ? humanEntry(text, false, at)
      : null
  }
  if (message.role !== 'assistant') {
    return null
  }
  if (text) {
    return { kind: 'agent', text, at }
  }
  const names = message.blocks.flatMap((block) => (block.type === 'tool-call' ? [block.name] : []))
  return names.length > 0 ? { kind: 'tools', names, at } : null
}

function humanEntry(raw: string, queued: boolean, at: number | null): GoalTranscriptEntry | null {
  const text = raw.replace(PASTED_CONTENT_TAG, '').trim()
  return text ? { kind: 'human', text, queued, at } : null
}
