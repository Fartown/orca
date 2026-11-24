import { normalizedNativeChatUserMessageText } from '../native-chat/transcript/images/native-chat-image-transcript-markers'
import type { NativeChatMessage } from '../native-chat/native-chat-types'
import {
  matchingNativeChatUserContentCounts,
  nativeChatPendingContentKey
} from '../native-chat/transcript/pending-sends/native-chat-pending-occurrence'
import type { DurableChatSubmitRecord, DurableChatUserEvidence } from './durable-chat-submit'

function matchesDurableChatUser(
  record: DurableChatSubmitRecord,
  message: DurableChatUserEvidence
): boolean {
  if (record.imagePaths.length !== message.imageCount) {
    return false
  }
  if (!record.text.trim() && record.imagePaths.length > 0) {
    return !message.text.trim()
  }
  return (
    (matchingNativeChatUserContentCounts(
      [
        {
          id: message.id,
          role: 'user',
          source: 'transcript',
          timestamp: null,
          blocks: [{ type: 'text', text: message.text }]
        }
      ],
      record.imagePaths
    ).get(nativeChatPendingContentKey(record)) ?? 0) > 0
  )
}

export function reconcileDurableChatSubmissions(
  records: readonly DurableChatSubmitRecord[],
  messages: readonly DurableChatUserEvidence[],
  sessionId: string | null
): Map<string, DurableChatUserEvidence> {
  const claimed = new Set(
    records
      .filter((r) => r.sessionId === sessionId && r.confirmedMessageId)
      .map((r) => r.confirmedMessageId)
  )
  const rows = new Map(
    messages.filter((message) => !claimed.has(message.id)).map((message) => [message.id, message])
  )
  const pending = records.filter(
    (record) =>
      record.sessionId === sessionId &&
      !['prepared', 'rejected', 'confirmed'].includes(record.state)
  )
  const proven = new Set<string>()
  const candidates = new Map<string, string[]>()
  const requestsByMessage = new Map<string, string[]>()
  for (const record of pending) {
    const boundary = record.transcriptBoundary
    const hasBoundary = boundary?.sessionId === sessionId
    if (hasBoundary) {
      proven.add(record.id)
    }
    const ids = [...rows.values()]
      .filter(
        (message) =>
          (!hasBoundary || message.transcriptOrder >= boundary.afterByteOffset) &&
          matchesDurableChatUser(record, message)
      )
      .map((message) => message.id)
    candidates.set(record.id, ids)
    for (const id of ids) {
      requestsByMessage.set(id, [...(requestsByMessage.get(id) ?? []), record.id])
    }
  }
  const visited = new Set<string>()
  const result = new Map<string, DurableChatUserEvidence>()
  for (const record of pending) {
    if (visited.has(record.id)) {
      continue
    }
    const members: string[] = []
    const queue = [record.id]
    const messageIds = new Set<string>()
    while (queue.length) {
      const id = queue.pop()
      if (id === undefined || visited.has(id)) {
        continue
      }
      visited.add(id)
      members.push(id)
      for (const candidate of candidates.get(id) ?? []) {
        messageIds.add(candidate)
        for (const other of requestsByMessage.get(candidate) ?? []) {
          if (!visited.has(other)) {
            queue.push(other)
          }
        }
      }
    }
    if (members.some((id) => !proven.has(id)) || messageIds.size < members.length) {
      continue
    }
    const ownerByMessage = new Map<string, string>()
    const assign = (id: string, seen: Set<string>): boolean => {
      for (const candidate of candidates.get(id) ?? []) {
        if (seen.has(candidate)) {
          continue
        }
        seen.add(candidate)
        const previous = ownerByMessage.get(candidate)
        if (previous === undefined || assign(previous, seen)) {
          ownerByMessage.set(candidate, id)
          return true
        }
      }
      return false
    }
    if (!members.every((id) => assign(id, new Set()))) {
      continue
    }
    for (const [messageId, requestId] of ownerByMessage) {
      const message = rows.get(messageId)
      if (message) {
        result.set(requestId, message)
      }
    }
  }
  return result
}

export function durableChatUserEvidence(
  messages: readonly NativeChatMessage[]
): DurableChatUserEvidence[] {
  return messages
    .filter((message) => message.role === 'user' && message.transcriptOrder !== undefined)
    .flatMap((message) =>
      message.transcriptOrder === undefined
        ? []
        : [
            {
              id: message.id,
              transcriptOrder: message.transcriptOrder,
              text: normalizedNativeChatUserMessageText(message) ?? '',
              imageCount: message.blocks.filter(
                (block) => block.type === 'image-ref' && (block.path || block.url)
              ).length
            }
          ]
    )
}
