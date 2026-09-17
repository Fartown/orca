import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Loader2, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import {
  lanArtifactShareErrorCode,
  lanArtifactShareErrorMessage,
  lookupLanArtifactShare,
  shareLanArtifact,
  stopLanArtifactWorkspace,
  type LanArtifactShareTarget
} from '../client/lan-artifact-share-client'
import { lanShareHostLabel } from './lan-artifact-share-copy'
import {
  initialLanShareState,
  lanShareReducer,
  type LanShareState
} from './lan-artifact-share-machine'
import type { ArtifactSharedWorkspace } from '../../../../../shared/self-hosted-artifacts/artifact-share-contract'
import type { LanArtifactShareTargetResolution } from './lan-artifact-share-target'
import { LanArtifactSharePanel } from './LanArtifactSharePanel'

/**
 * Share on local network: the computer that holds the file serves it. `resolveTarget` runs when
 * the popover opens so it always reflects the file's current owner.
 */
export function LanArtifactShareButton({
  resolveTarget,
  hasUnsavedChanges = false,
  className
}: {
  resolveTarget: () => LanArtifactShareTargetResolution
  hasUnsavedChanges?: boolean
  className?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [state, dispatch] = useReducer(lanShareReducer, initialLanShareState)
  const targetRef = useRef<LanArtifactShareTarget | null>(null)
  const sequence = useRef(0)
  const resolveTargetRef = useRef(resolveTarget)

  useEffect(() => {
    resolveTargetRef.current = resolveTarget
  })

  const check = useCallback(async (): Promise<void> => {
    const current = ++sequence.current
    dispatch({ type: 'check-started' })
    const resolution = resolveTargetRef.current()
    if (!resolution.ok) {
      targetRef.current = null
      dispatch({
        type: 'check-failed',
        code: 'artifact_share_unsupported_host',
        message: resolution.reason
      })
      return
    }
    targetRef.current = resolution.target
    try {
      const result = await lookupLanArtifactShare(resolution.target)
      if (current === sequence.current) {
        dispatch({ type: 'check-succeeded', result })
      }
    } catch (error) {
      if (current === sequence.current) {
        dispatch({
          type: 'check-failed',
          code: lanArtifactShareErrorCode(error),
          message: lanArtifactShareErrorMessage(error)
        })
      }
    }
  }, [])

  useEffect(() => {
    if (open) {
      void check()
    } else {
      sequence.current += 1
    }
  }, [check, open])

  const share = async (): Promise<void> => {
    const target = targetRef.current
    if (!target) {
      return
    }
    dispatch({ type: 'share-started' })
    try {
      const result = await shareLanArtifact(target)
      dispatch({ type: 'share-succeeded', result })
      toast.success(
        translate('auto.components.selfHostedArtifacts.shareButton.created', 'Link created')
      )
    } catch (error) {
      dispatch({
        type: 'share-failed',
        code: lanArtifactShareErrorCode(error),
        message: lanArtifactShareErrorMessage(error)
      })
    }
  }

  const stop = async (workspace: ArtifactSharedWorkspace): Promise<void> => {
    const target = targetRef.current
    if (!target) {
      return
    }
    dispatch({ type: 'stop-started' })
    try {
      await stopLanArtifactWorkspace(target.executionHostId, workspace.token)
      toast.success(
        translate('auto.components.selfHostedArtifacts.shareButton.stopped', 'Sharing stopped')
      )
      await check()
    } catch (error) {
      dispatch({ type: 'stop-failed', message: lanArtifactShareErrorMessage(error) })
    }
  }

  const label = translate(
    'auto.components.selfHostedArtifacts.shareButton.label',
    'Share on local network'
  )
  return (
    <Popover open={open} onOpenChange={(next) => state.busy === null && setOpen(next)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn('shrink-0', className)}
              aria-label={label}
            >
              {state.busy === 'sharing' ? <Loader2 className="animate-spin" /> : <Share2 />}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={6} className="w-80">
        <LanArtifactSharePopoverBody
          label={label}
          state={state}
          hasUnsavedChanges={hasUnsavedChanges}
          onShare={() => void share()}
          onRetry={() => void check()}
          onStop={(workspace) => void stop(workspace)}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Mounted only while the popover is open, so the button itself needs no dialog or store context. */
function LanArtifactSharePopoverBody({
  label,
  state,
  hasUnsavedChanges,
  onShare,
  onRetry,
  onStop,
  onClose
}: {
  label: string
  state: LanShareState
  hasUnsavedChanges: boolean
  onShare: () => void
  onRetry: () => void
  onStop: (workspace: ArtifactSharedWorkspace) => void
  onClose: () => void
}): React.JSX.Element {
  const confirm = useConfirmationDialog()
  const openSettingsTarget = useAppStore((store) => store.openSettingsTarget)
  const openSettingsPage = useAppStore((store) => store.openSettingsPage)
  const view = state.view
  const serving = view.kind === 'shared' ? new URL(view.url) : null

  const requestStop = async (): Promise<void> => {
    const workspace = view.kind === 'shared' || view.kind === 'blocked' ? view.workspace : null
    if (!workspace) {
      return
    }
    const accepted = await confirm({
      title: translate(
        'auto.components.selfHostedArtifacts.stopDialog.title',
        'Stop sharing {{workspace}}?',
        { workspace: workspace.label }
      ),
      description: translate(
        'auto.components.selfHostedArtifacts.stopDialog.description',
        'Every link to files in this workspace will stop working. Sharing it again creates new links.'
      ),
      confirmLabel: translate(
        'auto.components.selfHostedArtifacts.stopDialog.confirm',
        'Stop sharing'
      ),
      confirmVariant: 'destructive'
    })
    if (accepted) {
      onStop(workspace)
    }
  }

  return (
    <>
      <div className="space-y-1 border-b border-border/60 px-4 py-3.5">
        <h3 className="text-sm font-semibold">{label}</h3>
        <p className="truncate text-xs leading-5 text-muted-foreground">
          {serving
            ? translate(
                'auto.components.selfHostedArtifacts.shareButton.servedByAt',
                'Served by {{computer}} · {{address}}',
                {
                  computer: lanShareHostLabel(state.host),
                  address: serving.host
                }
              )
            : translate(
                'auto.components.selfHostedArtifacts.shareButton.servedBy',
                'Served by {{computer}}',
                {
                  computer: lanShareHostLabel(state.host)
                }
              )}
        </p>
      </div>
      <div className="p-4">
        <LanArtifactSharePanel
          state={state}
          hasUnsavedChanges={hasUnsavedChanges}
          onShare={onShare}
          onRetry={onRetry}
          onRequestStop={() => void requestStop()}
          onOpenSettings={() => {
            onClose()
            openSettingsTarget({ pane: 'artifacts', repoId: null })
            openSettingsPage()
          }}
        />
      </div>
    </>
  )
}
