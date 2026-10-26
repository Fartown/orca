import { useCallback } from 'react'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

/** Asks before a workspace stops being shared, unless General → "Ask Before Deleting Artifacts" is off. */
export function useConfirmStopSharing(): (workspaceLabel: string) => Promise<boolean> {
  const confirm = useConfirmationDialog()
  const skip = useAppStore((state) => state.settings?.skipDeleteArtifactConfirm === true)
  return useCallback(
    (workspaceLabel: string) =>
      skip
        ? Promise.resolve(true)
        : confirm({
            title: translate(
              'auto.components.selfHostedArtifacts.stopDialog.title',
              'Stop sharing {{workspace}}?',
              { workspace: workspaceLabel }
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
          }),
    [confirm, skip]
  )
}
