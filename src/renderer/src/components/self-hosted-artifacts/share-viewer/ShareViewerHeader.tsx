import type React from 'react'
import { FileCode, ListTree } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ShareDocument } from './viewer-document'

// Same recipe as the editor header's icon actions so the page reads as the app's own preview.
const HEADER_ACTION_CLASS_NAME =
  'flex-shrink-0 rounded p-1 transition-colors hover:bg-accent hover:text-foreground'

function HeaderAction({
  label,
  children
}: {
  label: string
  children: React.ReactElement
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function ShareViewerHeader({
  document: shared,
  tableOfContentsOpen,
  onToggleTableOfContents
}: {
  document: ShareDocument
  tableOfContentsOpen: boolean
  onToggleTableOfContents: () => void
}): React.JSX.Element {
  const directory = shared.relativePath.split('/').slice(0, -1).join('/')
  const tocLabel = translate(
    'auto.components.selfHostedArtifacts.shareViewer.tableOfContents',
    'Table of Contents'
  )
  const sourceLabel = translate(
    'auto.components.selfHostedArtifacts.shareViewer.viewSource',
    'View Markdown source'
  )
  return (
    <TooltipProvider delayDuration={300}>
      <header className="flex min-h-10 shrink-0 items-center gap-1 border-b border-border/70 bg-editor-surface px-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden px-1">
          <h1 className="truncate text-sm font-medium">{shared.title}</h1>
          {directory ? (
            <span className="hidden truncate font-mono text-xs text-muted-foreground sm:inline">
              {directory}
            </span>
          ) : null}
        </div>
        <span className="hidden shrink-0 px-1 text-xs text-muted-foreground md:inline">
          {translate(
            'auto.components.selfHostedArtifacts.shareViewer.sharedFrom',
            'Shared from Orca on {{computer}}',
            { computer: shared.computer }
          )}
        </span>
        <HeaderAction label={tocLabel}>
          <button
            type="button"
            className={cn(
              HEADER_ACTION_CLASS_NAME,
              tableOfContentsOpen ? 'bg-accent text-foreground' : 'text-muted-foreground'
            )}
            aria-label={tocLabel}
            aria-pressed={tableOfContentsOpen}
            onClick={onToggleTableOfContents}
          >
            <ListTree size={14} />
          </button>
        </HeaderAction>
        <HeaderAction label={sourceLabel}>
          <a
            className={cn(HEADER_ACTION_CLASS_NAME, 'text-muted-foreground')}
            href="?raw=1"
            aria-label={sourceLabel}
          >
            <FileCode size={14} />
          </a>
        </HeaderAction>
      </header>
    </TooltipProvider>
  )
}
