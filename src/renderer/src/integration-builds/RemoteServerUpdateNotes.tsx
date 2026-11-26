import type React from 'react'
import type { ChangelogData } from '../../../shared/updater/update-status-types'
import type { RemoteServerUpdatePhase } from '../runtime/hosts/updates/remote-server-update-coordinator'
import { useTranslate } from '@/i18n/use-translate'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'

const VISIBLE_PHASES = new Set<RemoteServerUpdatePhase>([
  'available',
  'queued',
  'checking-update',
  'downloading',
  'restarting',
  'failed'
])

export function RemoteServerUpdateNotes({
  changelog,
  phase
}: {
  changelog?: ChangelogData | null
  phase: RemoteServerUpdatePhase
}): React.JSX.Element | null {
  const t = useTranslate()
  const release = changelog?.release
  if (!release || !VISIBLE_PHASES.has(phase)) {
    return null
  }
  const description = release.description.trim()
  return (
    <div className="space-y-1">
      {description ? (
        <p className="text-xs leading-relaxed break-words text-muted-foreground">{description}</p>
      ) : null}
      {release.releaseNotesUrl ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={(event) => openAppHttpLink(release.releaseNotesUrl, { event })}
        >
          {t('auto.components.UpdateCard.aad383aecc', 'Release notes')}
        </button>
      ) : null}
    </div>
  )
}
