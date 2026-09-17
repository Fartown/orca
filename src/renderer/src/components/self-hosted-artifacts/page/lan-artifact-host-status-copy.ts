import type { ArtifactShareServiceStatus } from '../../../../../shared/self-hosted-artifacts/artifact-share-contract'
import { translate } from '@/i18n/i18n'

export function lanArtifactHostStatusLabel(status: ArtifactShareServiceStatus): string {
  switch (status.state) {
    case 'serving':
      return translate(
        'auto.components.selfHostedArtifacts.page.statusServing',
        'Serving · {{address}}',
        { address: `${status.ip}:${status.port}` }
      )
    case 'sharing-off':
      return translate('auto.components.selfHostedArtifacts.page.statusSharingOff', 'Sharing off')
    case 'orca-not-running':
      return translate(
        'auto.components.selfHostedArtifacts.page.statusOrcaNotRunning',
        "Orca isn't open"
      )
    case 'port-conflict':
      return translate(
        'auto.components.selfHostedArtifacts.page.statusPortConflict',
        'Port {{port}} is used by another program',
        { port: String(status.port) }
      )
    case 'failed':
      return translate(
        'auto.components.selfHostedArtifacts.page.statusFailed',
        'Failed to start: {{reason}}',
        { reason: status.reason }
      )
    case 'unverifiable':
      return status.reason === 'host-outdated'
        ? translate(
            'auto.components.selfHostedArtifacts.page.statusOutdated',
            'Orca there needs an update'
          )
        : translate(
            'auto.components.selfHostedArtifacts.page.statusDisconnected',
            'Not connected · status unknown'
          )
  }
}
