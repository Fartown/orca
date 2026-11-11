import { ChevronDown, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AgentIcon, type AgentCatalogEntry } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { LocalTaskPromptDelivery } from '@/local-tasks/local-task-session-launch'
import type { LocalTaskLaunchAgents } from '@/local-tasks/use-local-task-launch-agents'
import type { TuiAgent } from '../../../../shared/tui-agent'

// Why a cap: a host can have many agents installed; the rest stay one click away under More.
const SHOWN_AGENTS = 3

function AgentLabel({
  entry,
  isDefault
}: {
  entry: AgentCatalogEntry
  isDefault: boolean
}): React.JSX.Element {
  return (
    <>
      <AgentIcon agent={entry.id} size={14} />
      {entry.label}
      {isDefault ? (
        <span className="text-2xs font-normal text-muted-foreground">
          {translate('localTasks.createFlow.defaultAgent', 'Default')}
        </span>
      ) : null}
    </>
  )
}

function AgentPicker({
  launch,
  agent,
  onAgentChange
}: {
  launch: LocalTaskLaunchAgents
  agent: TuiAgent | null
  onAgentChange: (agent: TuiAgent | 'none') => void
}): React.JSX.Element {
  // Why the default first: it is what the session opens with unless the user picks another.
  const ordered = [
    ...launch.agents.filter((entry) => entry.id === launch.preferred),
    ...launch.agents.filter((entry) => entry.id !== launch.preferred)
  ]
  const shown = ordered.slice(0, SHOWN_AGENTS)
  const more = ordered.slice(SHOWN_AGENTS)
  const pickedMore = more.find((entry) => entry.id === agent)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.length > 0 ? (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1.5}
          value={shown.some((entry) => entry.id === agent) ? (agent ?? '') : ''}
          onValueChange={(value) => {
            const entry = shown.find((candidate) => candidate.id === value)
            if (entry) {
              onAgentChange(entry.id)
            }
          }}
          aria-label={translate('localTasks.links.agent', 'Agent')}
          className="flex-wrap"
        >
          {shown.map((entry) => (
            <ToggleGroupItem key={entry.id} value={entry.id}>
              <span className="flex items-center gap-1.5">
                <AgentLabel entry={entry} isDefault={entry.id === launch.defaultAgent} />
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      {more.length > 0 ? (
        <DropdownMenu>
          {/* Why not Button: outline has no picked state; this is outline sm plus the toggles' on accent. */}
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-sm font-medium whitespace-nowrap text-foreground shadow-xs transition-all outline-none hover:border-muted-foreground/35 hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                pickedMore && 'bg-accent text-accent-foreground'
              )}
            >
              {pickedMore ? (
                <AgentLabel entry={pickedMore} isDefault={pickedMore.id === launch.defaultAgent} />
              ) : (
                translate('localTasks.createFlow.moreAgents', 'More')
              )}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72">
            <DropdownMenuRadioGroup
              value={pickedMore?.id ?? ''}
              onValueChange={(value) => {
                const entry = more.find((candidate) => candidate.id === value)
                if (entry) {
                  onAgentChange(entry.id)
                }
              }}
            >
              {more.map((entry) => (
                <DropdownMenuRadioItem key={entry.id} value={entry.id}>
                  <AgentIcon agent={entry.id} size={14} />
                  {entry.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Toggle
        variant="outline"
        size="sm"
        pressed={agent === null}
        onPressedChange={() => onAgentChange('none')}
      >
        <span className="flex items-center gap-1.5">
          <X className="size-3.5" />
          {translate('localTasks.createFlow.noAgent', 'Not now')}
        </span>
      </Toggle>
    </div>
  )
}

/** 开工 (REQ-027): the agent, first prompt and delivery for the session in the picked workspace. */
export function LocalTaskCreateKickoff({
  workspaceName,
  launch,
  agent,
  onAgentChange,
  firstLine,
  onFirstLineChange,
  delivery,
  onDeliveryChange,
  briefOn
}: {
  workspaceName: string
  launch: LocalTaskLaunchAgents
  agent: TuiAgent | null
  onAgentChange: (agent: TuiAgent | 'none') => void
  firstLine: string
  onFirstLineChange: (firstLine: string) => void
  delivery: LocalTaskPromptDelivery
  onDeliveryChange: (delivery: LocalTaskPromptDelivery) => void
  briefOn: boolean
}): React.JSX.Element {
  const off = agent === null
  const firstLineLabel = translate('localTasks.createFlow.firstLine', 'First prompt')
  const options: { value: LocalTaskPromptDelivery; title: string; hint: string }[] = [
    {
      value: 'auto-submit',
      title: translate('localTasks.createFlow.deliverySend', 'Send now'),
      hint: translate('localTasks.createFlow.deliverySendHint', 'Sent as soon as the session opens')
    },
    {
      value: 'draft',
      title: translate('localTasks.createFlow.deliveryDraft', 'Put it in the input box first'),
      hint: translate(
        'localTasks.createFlow.deliveryDraftHint',
        'A draft you send after reading it'
      )
    }
  ]
  return (
    <div className="flex flex-col gap-3 border-t border-dashed border-border pt-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-sm font-medium">
          {translate('localTasks.createFlow.kickoff', 'Start work')}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {translate('localTasks.createFlow.kickoffIn', 'Opens a session in {{workspace}}', {
            workspace: workspaceName
          })}
        </span>
      </div>
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
        <span className="text-xs text-muted-foreground">
          {translate('localTasks.links.agent', 'Agent')}
        </span>
        <AgentPicker launch={launch} agent={agent} onAgentChange={onAgentChange} />
        {launch.unavailableReason ? (
          <p role="status" className="col-start-2 text-xs text-muted-foreground">
            {launch.unavailableReason}
          </p>
        ) : null}
        <span className="text-xs text-muted-foreground">{firstLineLabel}</span>
        <div className="flex min-w-0 items-center gap-3">
          <Input
            value={firstLine}
            disabled={off}
            onChange={(event) => onFirstLineChange(event.target.value)}
            aria-label={firstLineLabel}
            className="h-8 min-w-0 flex-1"
          />
          {briefOn ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {translate(
                'localTasks.createFlow.briefNote',
                'Followed by the task brief (can be turned off in Settings)'
              )}
            </span>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">
          {translate('localTasks.createFlow.delivery', 'Delivery')}
        </span>
        <RadioGroup
          value={delivery}
          disabled={off}
          onValueChange={(value) => {
            if (value === 'auto-submit' || value === 'draft') {
              onDeliveryChange(value)
            }
          }}
          aria-label={translate('localTasks.createFlow.delivery', 'Delivery')}
        >
          <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-md border border-input">
            {options.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex min-w-0 items-start gap-2 px-3 py-2',
                  off ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-accent',
                  !off && delivery === option.value && 'bg-accent'
                )}
              >
                <RadioGroupItem value={option.value} className="mt-0.5" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm">{option.title}</span>
                  <span className="text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </RadioGroup>
      </div>
    </div>
  )
}
