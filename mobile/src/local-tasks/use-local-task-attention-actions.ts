import { useRef, useState } from 'react'
import type { LocalTaskAttentionItem } from '../../../src/shared/local-tasks/local-task-link-types'
import {
  localTaskSnoozeUntil,
  type LocalTaskSnoozePreset
} from '../../../src/shared/local-tasks/local-task-snooze-presets'
import type { RpcClient } from '../transport/rpc-client'
import type { LocalTasksApi, LocalTaskWriteOutcome } from './local-tasks-api'
import type { LocalTasksCopy } from './local-tasks-copy'
import { localTaskWriteMessage } from './local-task-failure-message'
import {
  createLocalTaskOperationIds,
  sendLocalTaskWrite,
  type LocalTaskOperationIds
} from './local-task-operation-ids'
import { sendLocalTaskReply, type LocalTaskReplyOutcome } from './local-task-reply-send'
import type { LocalTasksLibrary } from './use-local-tasks-library'

/** What the last reply to an item came to, shown under it until the item goes away. */
export type LocalTaskReplyStatus = { kind: 'sending' } | LocalTaskReplyOutcome

/**
 * Writes behind the "Needs you" rows, and replies sent straight into the session. Each item keeps
 * its own operation ids per action, so a resend after a lost answer replays that one write.
 */
export function useLocalTaskAttentionActions(args: {
  api: LocalTasksApi
  library: Pick<LocalTasksLibrary, 'reload' | 'work'>
  /** The library host's client, where every linked session runs or is reached. */
  client: RpcClient | null
  copy: LocalTasksCopy
}) {
  const ids = useRef(new Map<string, LocalTaskOperationIds>())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [replies, setReplies] = useState<Record<string, LocalTaskReplyStatus>>({})
  const idsFor = (key: string) => {
    let entry = ids.current.get(key)
    if (!entry) {
      entry = createLocalTaskOperationIds()
      ids.current.set(key, entry)
    }
    return entry
  }
  const note = (key: string, outcome: LocalTaskWriteOutcome<unknown>) => {
    const message = localTaskWriteMessage(args.copy, outcome)
    setErrors((previous) => {
      const next = { ...previous }
      if (message) {
        next[key] = message
      } else {
        delete next[key]
      }
      return next
    })
  }

  const eachItem = async (
    action: 'seen' | 'snooze',
    items: readonly LocalTaskAttentionItem[],
    send: (
      item: LocalTaskAttentionItem,
      ids: LocalTaskOperationIds
    ) => Promise<LocalTaskWriteOutcome<unknown>>
  ) => {
    for (const item of items) {
      note(item.key, await send(item, idsFor(`${action}:${item.key}`)))
    }
    args.library.reload(['attention'])
  }
  const markSeen = (items: readonly LocalTaskAttentionItem[]) =>
    eachItem('seen', items, (item, operation) =>
      sendLocalTaskWrite(
        operation,
        { itemKey: item.key, taskSessionId: item.taskSessionId },
        args.api.acknowledge
      )
    )

  return {
    /** Per item key: what the last write for it came to, when there is something to say. */
    errors,
    /** Per item key: the last reply's delivery. */
    replies,
    markSeen,
    snooze: (items: readonly LocalTaskAttentionItem[], choice: LocalTaskSnoozePreset) => {
      const until = localTaskSnoozeUntil(choice, new Date())
      if (until === null) {
        return Promise.resolve()
      }
      return eachItem('snooze', items, (item, operation) =>
        sendLocalTaskWrite(
          operation,
          { itemKey: item.key, taskSessionId: item.taskSessionId, until },
          args.api.snooze
        )
      )
    },
    /** Sends once into the item's session; the caller puts the text back unless it went out. */
    reply: async (item: LocalTaskAttentionItem, text: string): Promise<LocalTaskReplyOutcome> => {
      const session = args.library.work.links.sessions.find(
        (entry) => entry.id === item.taskSessionId
      )
      setReplies((previous) => ({ ...previous, [item.key]: { kind: 'sending' } }))
      const work = args.copy.work
      const outcome: LocalTaskReplyOutcome = session
        ? await sendLocalTaskReply({
            client: args.client,
            session,
            text,
            reasons: {
              missing: work.replySessionMissing,
              notConnected: work.replyNotConnected,
              inputNotCleared: work.replyInputNotCleared,
              inputRefused: work.replyInputRefused,
              chatNotReady: work.replyChatNotReady
            }
          })
        : { kind: 'not-sent', reason: work.replyNoSession }
      setReplies((previous) => ({ ...previous, [item.key]: outcome }))
      args.library.reload(['attention'])
      return outcome
    }
  }
}

export type LocalTaskAttentionActions = ReturnType<typeof useLocalTaskAttentionActions>
