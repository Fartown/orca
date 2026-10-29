import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { NativeChatComposerNotices } from '@/components/native-chat/NativeChatComposerNotices'
import { useNativeChatHostOutage } from '@/components/native-chat/use-native-chat-host-outage'
import { useNativeChatHostOutageNotice } from '@/components/native-chat/use-native-chat-host-outage-notice'
import { translate } from '@/i18n/i18n'
import { activeAgentNotesSendFailureMessage } from '@/lib/active-agent-note-send-result'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import { localTaskEndpointTarget, localTaskIdEndpoint } from '@/local-tasks/local-task-endpoints'
import { sendLocalTaskReply } from '@/local-tasks/local-task-needs-you-actions'
import { localTaskItemClientKey } from '@/local-tasks/local-task-needs-you-rows'
import {
  localTaskNeedsYouStore,
  useLocalTaskNeedsYou
} from '@/local-tasks/local-task-needs-you-store'
import { LOCAL_TASK_COMMENT_MAX } from '../../../../shared/local-tasks/local-task-model'
import type {
  LocalTaskAttentionItem,
  LocalTaskSessionLink
} from '../../../../shared/local-tasks/local-task-link-types'

const IS_MAC = navigator.userAgent.includes('Mac')

/**
 * Types the next instruction for a finished turn and sends it to the session once, as Orca sends
 * any message to an agent. A failure keeps the text here with the reason; nothing is queued or
 * resent. The box stays usable while the host is away, under the host's own outage notice; only
 * the host's own judgment can say the turn moved on.
 */
export function LocalTaskReplyBox({
  item,
  link,
  movedOn
}: {
  item: LocalTaskAttentionItem
  link: LocalTaskSessionLink | undefined
  /** The host judged the session and no longer lists the item: its turn is not the one to answer. */
  movedOn: boolean
}): React.JSX.Element {
  const text = useLocalTaskNeedsYou(
    (state) => state.drafts[localTaskItemClientKey(item)]?.text ?? ''
  )
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const outage = useNativeChatHostOutage(
    localTaskEndpointTarget(localTaskIdEndpoint(item.taskSessionId))
  )
  const outageNotice = useNativeChatHostOutageNotice(outage)
  const sendable = text.trim().length > 0 && !busy && !movedOn && link !== undefined
  const submit = async (): Promise<void> => {
    if (!sendable || !link) {
      return
    }
    setBusy(true)
    setFailure(null)
    const result = await sendLocalTaskReply(link, text.trim())
    setBusy(false)
    if (result.status === 'sent') {
      localTaskNeedsYouStore.getState().closeReply(item)
      return
    }
    setFailure(
      activeAgentNotesSendFailureMessage(result.status, { explicitTarget: true, code: result.code })
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      {outageNotice ? <NativeChatComposerNotices notices={[outageNotice]} /> : null}
      <Textarea
        value={text}
        disabled={busy}
        maxLength={LOCAL_TASK_COMMENT_MAX}
        onChange={(event) =>
          localTaskNeedsYouStore.getState().setDraftText(item, event.target.value)
        }
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            (IS_MAC ? event.metaKey : event.ctrlKey) &&
            !isImeCompositionKeyDown(event)
          ) {
            event.preventDefault()
            void submit()
          }
        }}
        placeholder={translate(
          'localTasks.needsYou.reply.placeholder',
          'Next instruction for the agent…'
        )}
        aria-label={translate('localTasks.needsYou.reply.label', 'Reply')}
        className="min-h-14"
      />
      {movedOn ? (
        <span className="text-xs text-muted-foreground">
          {translate(
            'localTasks.needsYou.reply.moved',
            'The session moved on, so this reply would not reach the turn you saw. Your text is kept.'
          )}
        </span>
      ) : null}
      {failure ? (
        <span role="alert" className="text-xs text-destructive">
          {failure}
        </span>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => localTaskNeedsYouStore.getState().closeReply(item)}
        >
          {translate('localTasks.needsYou.reply.close', 'Close')}
        </Button>
        <Button size="xs" variant="secondary" disabled={!sendable} onClick={() => void submit()}>
          {busy
            ? translate('localTasks.needsYou.reply.sending', 'Sending…')
            : translate('localTasks.needsYou.reply.send', 'Send')}
        </Button>
      </div>
    </div>
  )
}
