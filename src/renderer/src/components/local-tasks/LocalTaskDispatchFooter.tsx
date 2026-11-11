import { ArrowUp, AtSign, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import AgentCombobox from '@/components/agent/AgentCombobox'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import type { AgentCatalogEntry } from '@/lib/agent-catalog'
import type { TuiAgent } from '../../../../shared/tui-agent'

export type LocalTaskDispatchMode = 'dispatch' | 'ask'

/** The dispatch box's bottom bar: @, agent, key hints, the conversation, Dispatch or Ask, send. */
export function LocalTaskDispatchFooter({
  agents,
  agent,
  defaultAgent,
  onAgentChange,
  mode,
  onModeChange,
  dispatcherOffered,
  busy,
  runOn,
  sendDisabled,
  blockedReason,
  onMention,
  onExpand,
  onSend
}: {
  agents: AgentCatalogEntry[]
  agent: TuiAgent | null
  /** The agent Settings names as default, so the picker can mark it. */
  defaultAgent: TuiAgent | null
  onAgentChange: (agent: TuiAgent) => void
  mode: LocalTaskDispatchMode
  onModeChange: (mode: LocalTaskDispatchMode) => void
  dispatcherOffered: boolean
  busy: boolean
  /** The host a dispatch to the picked target runs on; null while it goes to the dispatcher. */
  runOn: string | null
  sendDisabled: boolean
  blockedReason: string | null
  onMention: () => void
  onExpand: () => void
  onSend: () => void
}): React.JSX.Element {
  const keyCap = 'min-w-4 px-1 py-0 text-3xs'
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={translate('localTasks.dispatch.mention', 'Mention where to work')}
        onClick={onMention}
      >
        <AtSign className="size-3.5" />
      </Button>
      {agents.length > 0 && agent ? (
        // Why the wrapper: the combobox fills its parent, which would push the hints to the far end.
        <span className="inline-flex shrink-0 items-center gap-1">
          <AgentCombobox
            agents={agents}
            value={agent}
            defaultAgent={defaultAgent}
            onValueChange={onAgentChange}
            allowNarrowTrigger
            triggerClassName="h-6 w-auto border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-accent dark:bg-transparent"
          />
          {agent === defaultAgent ? (
            <span className="whitespace-nowrap text-2xs text-muted-foreground">
              {translate('localTasks.createFlow.defaultAgent', 'Default')}
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="hidden shrink-0 items-center gap-1 whitespace-nowrap text-2xs text-muted-foreground @xl/local-task-dispatch:flex">
        <ShortcutKeyCombo keys={['@']} keyCapClassName={keyCap} />
        {translate('localTasks.dispatch.hintMention', 'mention where to work')}
        <span aria-hidden>·</span>
        <ShortcutKeyCombo keys={['↵']} keyCapClassName={keyCap} />
        {mode === 'ask'
          ? translate('localTasks.dispatch.hintAsk', 'ask')
          : translate('localTasks.dispatch.hintSend', 'dispatch')}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        {runOn ? (
          <span className="hidden max-w-48 truncate text-2xs text-muted-foreground @3xl/local-task-dispatch:inline">
            {translate('localTasks.dispatch.executedBy', 'Run on {{host}}', { host: runOn })}
          </span>
        ) : null}
        {dispatcherOffered ? (
          <Button variant="ghost" size="xs" disabled={!agent || busy} onClick={onExpand}>
            <Maximize2 className="size-3.5" />
            {translate('localTasks.dispatch.expand', 'Open conversation')}
          </Button>
        ) : null}
        {dispatcherOffered ? (
          <ToggleGroup
            type="single"
            size="xs"
            variant="outline"
            value={mode}
            onValueChange={(value) => {
              if (value === 'dispatch' || value === 'ask') {
                onModeChange(value)
              }
            }}
            aria-label={translate('localTasks.dispatch.mode', 'Dispatch or ask')}
          >
            <ToggleGroupItem value="dispatch">
              {translate('localTasks.dispatch.modeDispatch', 'Dispatch')}
            </ToggleGroupItem>
            <ToggleGroupItem value="ask">
              {translate('localTasks.dispatch.modeAsk', 'Ask')}
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
        {/* Why not Button: no size draws a round send button; this mirrors default icon-sm. */}
        <button
          type="button"
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-all outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          disabled={sendDisabled}
          title={blockedReason ?? undefined}
          aria-label={
            mode === 'ask'
              ? translate('localTasks.dispatch.modeAsk', 'Ask')
              : translate('localTasks.dispatch.submit', 'Dispatch')
          }
          onClick={onSend}
        >
          <ArrowUp className="size-4" />
        </button>
      </span>
    </div>
  )
}
