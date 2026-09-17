import { ArrowRight, Loader2, RotateCw, Share2 } from 'lucide-react'
import { ArtifactPublishedLinkPanel } from '@/components/artifacts/ArtifactPublishedLinkPanel'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { lanShareBlockedMessage, lanShareHostLabel } from './lan-artifact-share-copy'
import type { LanShareState } from './lan-artifact-share-machine'

const noop = (): void => {}

export function LanArtifactSharePanel({
  state,
  hasUnsavedChanges,
  onShare,
  onRetry,
  onRequestStop,
  onOpenSettings
}: {
  state: LanShareState
  hasUnsavedChanges: boolean
  onShare: () => void
  onRetry: () => void
  onRequestStop: () => void
  onOpenSettings: () => void
}): React.JSX.Element {
  const { view, busy, actionError } = state
  const computer = lanShareHostLabel(state.host)
  const isLocal = !state.host || state.host.executionHostId === 'local'

  if (view.kind === 'checking') {
    return (
      <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {translate('auto.components.selfHostedArtifacts.shareButton.checking', 'Checking…')}
      </div>
    )
  }

  const stopButton = (workspaceLabel: string) => (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="w-full"
      disabled={busy !== null}
      onClick={onRequestStop}
    >
      {busy === 'stopping' ? <Loader2 className="animate-spin" /> : null}
      {translate(
        'auto.components.selfHostedArtifacts.shareButton.stopWorkspace',
        'Stop sharing {{workspace}}',
        { workspace: workspaceLabel }
      )}
    </Button>
  )

  if (view.kind === 'blocked' || view.kind === 'check-failed') {
    const message =
      view.kind === 'blocked'
        ? lanShareBlockedMessage({
            reason: view.reason,
            computer,
            isLocal,
            port: view.port,
            detail: view.message
          })
        : translate(
            'auto.components.selfHostedArtifacts.shareButton.checkFailed',
            "Couldn't check sharing: {{reason}}",
            { reason: view.message }
          )
    const showSettings = view.kind === 'blocked' && view.reason === 'sharing-off' && isLocal
    return (
      <div className="space-y-3">
        <p className="text-xs leading-5 text-muted-foreground">{message}</p>
        {view.kind === 'blocked' && view.reason === 'serve-failed' && view.message ? (
          <p className="break-words font-mono text-[11px] text-muted-foreground">{view.message}</p>
        ) : null}
        {showSettings ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onOpenSettings}
          >
            {translate(
              'auto.components.selfHostedArtifacts.shareButton.openSettings',
              'Open Artifacts settings'
            )}
            <ArrowRight />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={onRetry}>
            <RotateCw />
            {translate('auto.components.selfHostedArtifacts.shareButton.retry', 'Try again')}
          </Button>
        )}
        {view.kind === 'blocked' && view.workspace ? stopButton(view.workspace.label) : null}
      </div>
    )
  }

  if (view.kind === 'unshared') {
    return (
      <div className="space-y-3">
        <p className="text-xs leading-5 text-muted-foreground">
          {translate(
            'auto.components.selfHostedArtifacts.shareButton.workspaceScopeNamed',
            'Anyone with the link can open every file in {{workspace}} (except .git, .env and similar). The link always shows the saved file.',
            { workspace: view.workspaceLabel }
          )}
        </p>
        {actionError ? <p className="text-xs leading-5 text-destructive">{actionError}</p> : null}
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={busy !== null}
          onClick={onShare}
        >
          {busy === 'sharing' ? <Loader2 className="animate-spin" /> : <Share2 />}
          {busy === 'sharing'
            ? translate('auto.components.selfHostedArtifacts.shareButton.generating', 'Generating…')
            : translate(
                'auto.components.selfHostedArtifacts.shareButton.generate',
                'Generate link'
              )}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ArtifactPublishedLinkPanel
        shareUrl={view.url}
        publishing={false}
        sharingEnabled={false}
        onUpdate={noop}
      />
      <p className="text-[11px] leading-4 text-muted-foreground">
        {translate(
          'auto.components.selfHostedArtifacts.shareButton.sharingWorkspace',
          'Sharing all of {{workspace}}.',
          { workspace: view.workspace.label }
        )}
        {hasUnsavedChanges
          ? ` ${translate('auto.components.selfHostedArtifacts.shareButton.saveToShow', 'Save to show your latest changes.')}`
          : null}
      </p>
      {actionError ? <p className="text-xs leading-5 text-destructive">{actionError}</p> : null}
      {stopButton(view.workspace.label)}
    </div>
  )
}
