import { useState } from 'react'
import { AlarmClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import { localTaskSnoozePresetLabel } from '@/local-tasks/local-task-attention-copy'
import { snoozeLocalTaskItems } from '@/local-tasks/local-task-needs-you-actions'
import type { LocalTaskAttentionItem } from '../../../../shared/local-tasks/local-task-link-types'
import {
  LOCAL_TASK_SNOOZE_PRESETS,
  localTaskSnoozeUntil
} from '../../../../shared/local-tasks/local-task-snooze-presets'

function localInputValue(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 1 hour, tonight, tomorrow, next week (local time) or a picked time; the items return then. */
export function LocalTaskSnoozeMenu({
  items,
  open,
  onOpenChange,
  now,
  showKey = false,
  label
}: {
  items: readonly LocalTaskAttentionItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  now: number
  showKey?: boolean
  label?: string
}): React.JSX.Element {
  const currentTime = new Date(now)
  const [custom, setCustom] = useState(() => localInputValue(now + 2 * 60 * 60 * 1000))
  const customUntil = new Date(custom).getTime()
  const snooze = (until: number): void => {
    onOpenChange(false)
    void snoozeLocalTaskItems(items, until)
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" disabled={items.length === 0}>
          <AlarmClock className="size-3.5" />
          {label ?? translate('localTasks.needsYou.snooze.trigger', 'Snooze')}
          {showKey ? (
            <ShortcutKeyCombo
              keys={['H']}
              className="ml-0.5"
              keyCapClassName="min-w-4 px-1 py-0 text-3xs"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <div className="flex flex-col p-1">
          {LOCAL_TASK_SNOOZE_PRESETS.map((preset) => {
            const until = localTaskSnoozeUntil(preset, currentTime)
            return until === null ? null : (
              <Button
                key={preset}
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => snooze(until)}
              >
                {localTaskSnoozePresetLabel(preset)}
              </Button>
            )
          })}
          <div className="mt-1 flex flex-col gap-1.5 border-t border-border px-2 pb-1 pt-2">
            <span className="text-2xs text-muted-foreground">
              {translate('localTasks.needsYou.snooze.custom', 'Until a time you pick')}
            </span>
            <Input
              type="datetime-local"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              aria-label={translate('localTasks.needsYou.snooze.custom', 'Until a time you pick')}
              className="h-7"
            />
            <Button
              size="xs"
              variant="secondary"
              disabled={!(customUntil > now)}
              onClick={() => snooze(customUntil)}
            >
              {translate('localTasks.needsYou.snooze.apply', 'Snooze until then')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
