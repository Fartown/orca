import { useState } from 'react'
import { CheckCheck, MessageSquareReply, SquareArrowOutUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { localTaskAttentionKindLabel } from '@/local-tasks/local-task-attention-copy'
import {
  acknowledgeLocalTaskItems,
  openLocalTaskItemSession
} from '@/local-tasks/local-task-needs-you-actions'
import {
  localTaskItemClientKey,
  type LocalTaskNeedsYouEntry,
  type LocalTaskNeedsYouStanding
} from '@/local-tasks/local-task-needs-you-rows'
import {
  localTaskNeedsYouStore,
  useLocalTaskNeedsYou
} from '@/local-tasks/local-task-needs-you-store'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import { LocalTaskReplyBox } from './LocalTaskReplyBox'
import { LocalTaskSnoozeMenu } from './LocalTaskSnoozeMenu'

function HeldNote({ standing }: { standing: LocalTaskNeedsYouStanding }): React.JSX.Element {
  return (
    <span className="text-2xs text-muted-foreground">
      {standing === 'moved-on'
        ? translate('localTasks.needsYou.item.left', 'No longer waiting on you')
        : translate('localTasks.needsYou.item.unverifiable', 'Host not connected; cannot confirm')}
    </span>
  )
}

/** One item: what it waits for, who said what last, and the four actions (REQ-015). */
export function LocalTaskNeedsYouItem({
  entry,
  link,
  now,
  ownActions
}: {
  entry: LocalTaskNeedsYouEntry
  link: LocalTaskSessionLink | undefined
  now: number
  /** Seen and snooze per item, when the row merges several; a single item uses the row's. */
  ownActions: boolean
}): React.JSX.Element {
  const { item, standing } = entry
  const replyOpen = useLocalTaskNeedsYou((state) => localTaskItemClientKey(item) in state.drafts)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const agent = formatAgentTypeLabel(item.agent)
  return (
    <div className="flex flex-col gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent/40">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="rounded border border-border px-1.5 text-2xs leading-5 text-foreground">
          {localTaskAttentionKindLabel(item.kind)}
        </span>
        <span className="text-muted-foreground">{agent}</span>
        <span className="text-2xs text-muted-foreground">
          {formatLocalTaskTime(item.since, now)}
        </span>
        {standing === 'listed' ? null : <HeldNote standing={standing} />}
      </div>
      {item.lastMessage ? (
        <p className="line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
          {item.kind === 'unread-done'
            ? translate(
                'localTasks.needsYou.item.stopped',
                '{{agent}} stopped. Last words: {{message}}',
                {
                  agent,
                  message: item.lastMessage
                }
              )
            : item.lastMessage}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="xs" onClick={() => openLocalTaskItemSession(item)}>
          <SquareArrowOutUpRight className="size-3.5" />
          {translate('localTasks.needsYou.item.open', 'Open session')}
        </Button>
        {item.replyable && !replyOpen ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => localTaskNeedsYouStore.getState().openReply(item)}
          >
            <MessageSquareReply className="size-3.5" />
            {translate('localTasks.needsYou.item.reply', 'Reply')}
          </Button>
        ) : null}
        {ownActions && standing === 'listed' ? (
          <>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void acknowledgeLocalTaskItems([item])}
            >
              <CheckCheck className="size-3.5" />
              {translate('localTasks.needsYou.item.seen', 'Mark as seen')}
            </Button>
            <LocalTaskSnoozeMenu
              items={[item]}
              open={snoozeOpen}
              onOpenChange={setSnoozeOpen}
              now={now}
            />
          </>
        ) : null}
      </div>
      {replyOpen ? (
        <LocalTaskReplyBox item={item} link={link} movedOn={standing === 'moved-on'} />
      ) : null}
    </div>
  )
}
