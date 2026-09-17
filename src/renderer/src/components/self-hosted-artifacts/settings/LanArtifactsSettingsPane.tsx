import { ArrowRight } from 'lucide-react'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import { SettingsRow, SettingsSwitchRow } from '@/components/settings/SettingsFormControls'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/lib/web-client-location'
import { useAppStore } from '@/store'
import { LanArtifactLocalServiceSettings } from './LanArtifactLocalServiceSettings'

export function LanArtifactsSettingsPane({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
}): React.JSX.Element {
  const openArtifactsPage = useAppStore((state) => state.openArtifactsPage)
  // Why: the capability lives in the host's settings store and is not remotely grantable, so a
  // web client can only mirror it.
  const isWebClient = isWebClientLocation()
  const sharingEnabled = settings.artifactSharingEnabled === true

  return (
    <div className="divide-y divide-border">
      <SettingsSwitchRow
        label={translate(
          'auto.components.selfHostedArtifacts.settings.allowSharing',
          'Share on local network from this computer'
        )}
        description={
          isWebClient
            ? translate(
                'auto.components.selfHostedArtifacts.settings.allowSharingWeb',
                'Desktop only. Open Settings → Artifacts on the host device to change this setting.'
              )
            : translate(
                'auto.components.selfHostedArtifacts.settings.allowSharingDescription',
                'While Orca is open, anyone with a link can open the files in the workspace it points to. Turning this off pauses every link; sharing records are kept.'
              )
        }
        checked={sharingEnabled}
        disabled={isWebClient}
        onChange={() => void updateSettings({ artifactSharingEnabled: !sharingEnabled })}
      />
      <SettingsSwitchRow
        label={translate('auto.components.settings.artifacts.showButton', 'Show Artifacts Button')}
        description={translate(
          'auto.components.settings.artifacts.showButtonDescription',
          'Show the Artifacts shortcut in the sidebar.'
        )}
        checked={settings.showArtifactsButton === true}
        onChange={() => void updateSettings({ showArtifactsButton: !settings.showArtifactsButton })}
      />
      {isWebClient ? null : (
        <section className="py-3">
          <LanArtifactLocalServiceSettings sharingEnabled={sharingEnabled} />
        </section>
      )}
      <SettingsRow
        label={translate(
          'auto.components.selfHostedArtifacts.settings.sharedLinksLabel',
          'Shared workspaces'
        )}
        description={translate(
          'auto.components.selfHostedArtifacts.settings.openArtifactsDescription',
          'See shared workspaces on this computer and connected computers, copy links, or stop sharing.'
        )}
        control={
          <Button type="button" variant="outline" size="xs" onClick={openArtifactsPage}>
            {translate('auto.components.settings.artifacts.openArtifacts', 'Open Artifacts')}
            <ArrowRight />
          </Button>
        }
      />
    </div>
  )
}
