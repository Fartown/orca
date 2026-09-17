import { useEffect, useState } from 'react'
import { ArtifactListToolbar } from '@/components/artifacts/ArtifactListToolbar'
import { ArtifactsPageSkeleton } from '@/components/artifacts/ArtifactsPageSkeleton'
import { ArtifactsPageErrorBanner } from '@/components/artifacts/ArtifactsPageStates'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { LanArtifactHostSection } from './LanArtifactHostSection'
import { useLanArtifactHosts } from './use-lan-artifact-hosts'

/** Shared workspaces grouped by the computer that serves them. */
export default function LanArtifactsPage(): React.JSX.Element {
  const closePage = useAppStore((state) => state.closeArtifactsPage)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const confirm = useConfirmationDialog()
  const { hosts, loading, error, stoppingToken, reload, stopWorkspace } = useLanArtifactHosts()
  const [query, setQuery] = useState('')

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target
      if (event.key !== 'Escape' || event.defaultPrevented || !(target instanceof HTMLElement)) {
        return
      }
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return
      }
      event.preventDefault()
      closePage()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closePage])

  const totalWorkspaces = hosts.reduce((sum, host) => sum + host.workspaces.length, 0)

  return (
    <main className="relative flex h-full min-h-0 flex-1 flex-col bg-background pt-5 text-foreground md:pt-6">
      <header
        className="flex shrink-0 items-center gap-3 px-3 pb-3 md:px-5"
        // Why: keep the title clear of Windows/Linux window controls, like the upstream page.
        style={{ paddingRight: 'max(0.75rem, var(--window-controls-width, 0px))' }}
      >
        <h1 className="flex-1 truncate text-base font-semibold leading-8">
          {translate('auto.components.selfHostedArtifacts.page.title', 'Artifacts')}
        </h1>
        <ArtifactListToolbar
          query={query}
          onQueryChange={setQuery}
          onRefresh={() => void reload()}
          isRefreshing={loading}
        />
      </header>
      {error ? (
        <ArtifactsPageErrorBanner error={error} loading={loading} onRetry={() => void reload()} />
      ) : null}
      {loading && hosts.length === 0 ? (
        <ArtifactsPageSkeleton />
      ) : (
        <div className="scrollbar-sleek min-h-0 flex-1 space-y-6 overflow-y-auto px-3 pb-6 md:px-5">
          {totalWorkspaces === 0 && hosts.every((host) => host.service.state !== 'unverifiable') ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.selfHostedArtifacts.page.empty',
                'Nothing is shared yet. Open a file and choose Share on local network.'
              )}
            </p>
          ) : null}
          {hosts.map((listing) => (
            <LanArtifactHostSection
              key={listing.host.executionHostId}
              listing={listing}
              query={query}
              stoppingToken={stoppingToken}
              onOpenSettings={() => {
                openSettingsTarget({ pane: 'artifacts', repoId: null })
                openSettingsPage()
              }}
              onStopWorkspace={(workspace) =>
                void confirm({
                  title: translate(
                    'auto.components.selfHostedArtifacts.stopDialog.title',
                    'Stop sharing {{workspace}}?',
                    {
                      workspace: workspace.label
                    }
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
                }).then((accepted) =>
                  accepted
                    ? stopWorkspace(listing.host.executionHostId, workspace.token)
                    : undefined
                )
              }
            />
          ))}
        </div>
      )}
    </main>
  )
}
