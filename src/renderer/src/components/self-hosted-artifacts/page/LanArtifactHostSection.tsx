import { Copy, ExternalLink, Loader2, Settings } from 'lucide-react'
import type {
  ArtifactShareHostListing,
  ArtifactSharedWorkspace
} from '../../../../../shared/self-hosted-artifacts/artifact-share-contract'
import {
  copyArtifactLink,
  openArtifactInBrowser
} from '@/components/artifacts/artifact-link-actions'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { lanShareHostLabel } from '../share-button/lan-artifact-share-copy'
import { lanArtifactHostStatusLabel } from './lan-artifact-host-status-copy'

function WorkspaceRow({
  workspace,
  stopping,
  onStop
}: {
  workspace: ArtifactSharedWorkspace
  stopping: boolean
  onStop: () => void
}): React.JSX.Element {
  return (
    <li className="rounded-md border border-border">
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{workspace.label}</p>
          <p
            className="truncate font-mono text-[11px] text-muted-foreground"
            title={workspace.rootPath}
          >
            {workspace.rootPath}
          </p>
        </div>
        <Button type="button" variant="outline" size="xs" disabled={stopping} onClick={onStop}>
          {stopping ? <Loader2 className="animate-spin" /> : null}
          {translate('auto.components.selfHostedArtifacts.page.stopSharing', 'Stop sharing')}
        </Button>
      </div>
      {workspace.linkedFiles.length > 0 ? (
        <ul className="border-t border-border/60">
          {workspace.linkedFiles.map((file) => (
            <li
              key={file.relativePath}
              className="flex items-center gap-1 px-3 py-1.5 hover:bg-muted/40"
            >
              <p className="min-w-0 flex-1 truncate text-xs" title={file.relativePath}>
                {file.relativePath}
              </p>
              {file.url ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={translate(
                      'auto.components.selfHostedArtifacts.page.copyLink',
                      'Copy link'
                    )}
                    onClick={() => void copyArtifactLink(file.url ?? '')}
                  >
                    <Copy />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={translate(
                      'auto.components.selfHostedArtifacts.page.openLink',
                      'Open in browser'
                    )}
                    onClick={() => openArtifactInBrowser(file.url ?? '')}
                  >
                    <ExternalLink />
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function LanArtifactHostSection({
  listing,
  query,
  stoppingToken,
  onStopWorkspace,
  onOpenSettings
}: {
  listing: ArtifactShareHostListing
  query: string
  stoppingToken: string | null
  onStopWorkspace: (workspace: ArtifactSharedWorkspace) => void
  onOpenSettings: () => void
}): React.JSX.Element {
  const isLocal = listing.host.executionHostId === 'local'
  const needle = query.trim().toLowerCase()
  const workspaces = needle
    ? listing.workspaces.filter(
        (workspace) =>
          workspace.label.toLowerCase().includes(needle) ||
          workspace.rootPath.toLowerCase().includes(needle) ||
          workspace.linkedFiles.some((file) => file.relativePath.toLowerCase().includes(needle))
      )
    : listing.workspaces
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{lanShareHostLabel(listing.host)}</h2>
        <span className="truncate text-xs text-muted-foreground">
          {lanArtifactHostStatusLabel(listing.service)}
        </span>
        {isLocal ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label={translate(
              'auto.components.selfHostedArtifacts.page.settings',
              'Sharing settings'
            )}
            onClick={onOpenSettings}
          >
            <Settings />
          </Button>
        ) : null}
      </div>
      {listing.service.state === 'unverifiable' ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.selfHostedArtifacts.page.disconnectedHint',
            "Can't confirm sharing on this computer while it's not connected. Its links keep working while Orca is open there."
          )}
        </p>
      ) : workspaces.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.selfHostedArtifacts.page.noWorkspaces',
            'No shared workspaces.'
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {workspaces.map((workspace) => (
            <WorkspaceRow
              key={workspace.token}
              workspace={workspace}
              stopping={stoppingToken === workspace.token}
              onStop={() => onStopWorkspace(workspace)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
