import { useCallback, useEffect, useState } from 'react'
import type { ArtifactShareServiceStatus } from '../../../../../shared/self-hosted-artifacts/artifact-share-contract'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { SettingsRow } from '@/components/settings/SettingsFormControls'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import {
  configureLocalLanArtifactShare,
  lanArtifactShareErrorMessage,
  readLocalLanArtifactShareStatus
} from '../client/lan-artifact-share-client'
import { lanArtifactHostStatusLabel } from '../page/lan-artifact-host-status-copy'

const AUTO_IP = 'auto'

/** This computer's share service: status, the address links use, and the port they point at. */
export function LanArtifactLocalServiceSettings({
  sharingEnabled
}: {
  sharingEnabled: boolean
}): React.JSX.Element {
  const confirm = useConfirmationDialog()
  const [status, setStatus] = useState<ArtifactShareServiceStatus | null>(null)
  const [portDraft, setPortDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await readLocalLanArtifactShareStatus()
      setStatus(result.service)
      setPortDraft(
        result.service.state === 'serving' || result.service.state === 'port-conflict'
          ? String(result.service.port)
          : ''
      )
      setError(null)
    } catch (statusError) {
      setError(lanArtifactShareErrorMessage(statusError))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, sharingEnabled])

  const apply = async (request: { port?: number; ip?: string }): Promise<void> => {
    setSaving(true)
    try {
      const result = await configureLocalLanArtifactShare(request)
      setStatus(result.service)
      setError(null)
    } catch (configureError) {
      setError(lanArtifactShareErrorMessage(configureError))
    } finally {
      setSaving(false)
    }
  }

  const applyPort = async (): Promise<void> => {
    const port = Number(portDraft)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      setError(
        translate(
          'auto.components.selfHostedArtifacts.settings.portInvalid',
          'Choose a port between 1024 and 65535.'
        )
      )
      return
    }
    const accepted = await confirm({
      title: translate(
        'auto.components.selfHostedArtifacts.settings.changePortTitle',
        'Change the share port?'
      ),
      description: translate(
        'auto.components.selfHostedArtifacts.settings.changePortDescription',
        'Links already sent from this computer will stop working. New links use the new port.'
      ),
      confirmLabel: translate(
        'auto.components.selfHostedArtifacts.settings.changePortConfirm',
        'Change port'
      ),
      confirmVariant: 'destructive'
    })
    if (accepted) {
      await apply({ port })
    }
  }

  const serving = status?.state === 'serving' ? status : null
  return (
    <div className="divide-y divide-border">
      <SettingsRow
        label={translate(
          'auto.components.selfHostedArtifacts.settings.statusLabel',
          'Share service on this computer'
        )}
        description={
          status
            ? lanArtifactHostStatusLabel(status)
            : translate('auto.components.selfHostedArtifacts.settings.statusLoading', 'Checking…')
        }
        control={
          <Button type="button" variant="outline" size="xs" onClick={() => void refresh()}>
            {translate('auto.components.selfHostedArtifacts.settings.refresh', 'Refresh')}
          </Button>
        }
      />
      {serving ? (
        <SettingsRow
          label={translate('auto.components.selfHostedArtifacts.settings.ipLabel', 'Link address')}
          description={translate(
            'auto.components.selfHostedArtifacts.settings.ipDescription',
            'The local network IP that links use. Links change if this computer’s IP changes.'
          )}
          control={
            <Select
              value={serving.ipChoice ?? AUTO_IP}
              onValueChange={(value) => void apply({ ip: value })}
            >
              <SelectTrigger size="sm" className="w-[160px]" disabled={saving}>
                <SelectValue>{serving.ip}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_IP}>
                  {translate('auto.components.selfHostedArtifacts.settings.ipAuto', 'Automatic')}
                </SelectItem>
                {serving.ipCandidates.map((candidate) => (
                  <SelectItem key={candidate} value={candidate}>
                    {candidate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      ) : null}
      {serving || status?.state === 'port-conflict' ? (
        <SettingsRow
          label={translate('auto.components.selfHostedArtifacts.settings.portLabel', 'Port')}
          description={translate(
            'auto.components.selfHostedArtifacts.settings.portDescription',
            'Orca keeps this port so links stay valid. Change it only if another program needs it.'
          )}
          control={
            <div className="flex items-center gap-2">
              <Input
                className="h-8 w-24"
                inputMode="numeric"
                value={portDraft}
                disabled={saving}
                onChange={(event) => setPortDraft(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={saving}
                onClick={() => void applyPort()}
              >
                {translate('auto.components.selfHostedArtifacts.settings.applyPort', 'Apply')}
              </Button>
            </div>
          }
        />
      ) : null}
      {error ? <p className="py-2 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
