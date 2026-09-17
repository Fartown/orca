import { translate } from '@/i18n/i18n'
import type { LanShareBlockedReason } from './lan-artifact-share-machine'

export function lanShareHostLabel(host: { executionHostId: string; label: string } | null): string {
  if (!host || host.executionHostId === 'local') {
    return translate(
      'auto.components.selfHostedArtifacts.shareButton.thisComputer',
      'This computer'
    )
  }
  return host.label
}

/** One sentence per blocking reason; the owner's message is appended when it adds detail. */
export function lanShareBlockedMessage(input: {
  reason: LanShareBlockedReason
  computer: string
  isLocal: boolean
  port: number | null
  detail: string
}): string {
  const values = { computer: input.computer, port: String(input.port ?? '') }
  switch (input.reason) {
    case 'sharing-off':
      return input.isLocal
        ? translate(
            'auto.components.selfHostedArtifacts.shareButton.sharingOffLocal',
            'Local network sharing is off on this computer.'
          )
        : translate(
            'auto.components.selfHostedArtifacts.shareButton.sharingOffRemote',
            'Turn on local network sharing in Orca on {{computer}}.',
            values
          )
    case 'orca-not-running':
      return translate(
        'auto.components.selfHostedArtifacts.shareButton.orcaNotRunning',
        "Orca isn't open on {{computer}}. Open it there to share this file.",
        values
      )
    case 'unreachable':
      return translate(
        'auto.components.selfHostedArtifacts.shareButton.unreachable',
        "Can't reach {{computer}}. Links it already serves keep working.",
        values
      )
    case 'outdated':
      return translate(
        'auto.components.selfHostedArtifacts.shareButton.outdated',
        'Orca on {{computer}} needs an update. Reconnect to update it.',
        values
      )
    case 'port-conflict':
      return translate(
        'auto.components.selfHostedArtifacts.shareButton.portConflict',
        'Port {{port}} on {{computer}} is used by another program.',
        values
      )
    case 'serve-failed':
      return translate(
        'auto.components.selfHostedArtifacts.shareButton.serveFailed',
        'The share service on {{computer}} failed to start.',
        values
      )
    case 'path-denied':
      return translate(
        'auto.components.selfHostedArtifacts.shareButton.pathDenied',
        "This file can't be shared."
      )
    case 'unsupported':
      return translate(
        'auto.components.selfHostedArtifacts.shareButton.unsupported',
        "Files on this computer can't be shared from here."
      )
  }
}
