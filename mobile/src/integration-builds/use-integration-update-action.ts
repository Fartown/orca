import { useStore } from 'zustand'
import { integrationChangeSummary } from '../../../src/shared/integration-builds/release-catalog'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { downloadAndInstallUpdate, mobileUpdates } from './mobile-updates'
import { isUpdateBusy, type UpdateStage } from './update-controller'

const installable = (stage: UpdateStage) =>
  ['ready', 'permission', 'installer-opened'].includes(stage)

export function useIntegrationUpdateAction() {
  const { stage, progress, error, release } = useStore(mobileUpdates.store)
  const t = useMobileTranslation()
  const summary = release && stage !== 'latest' ? integrationChangeSummary(release) : null
  const label =
    stage === 'checking'
      ? t('integrationBuilds.updateRow.checking', 'Checking for updates…')
      : stage === 'downloading'
        ? t('integrationBuilds.updateRow.downloading', 'Downloading update… {{percent}}%', {
            percent: Math.floor(progress)
          })
        : stage === 'verifying'
          ? t('integrationBuilds.updateRow.verifying', 'Verifying APK…')
          : stage === 'installing'
            ? t('integrationBuilds.updateRow.installing', 'Opening Android installer…')
            : installable(stage)
              ? t('integrationBuilds.updateRow.install', 'Install downloaded update')
              : stage === 'available'
                ? t('integrationBuilds.updateRow.download', 'Download and install update')
                : stage === 'error' && release
                  ? t('integrationBuilds.updateRow.retry', 'Retry update')
                  : t('integrationBuilds.updateRow.check', 'Check for updates')
  return {
    stage,
    error,
    summary,
    label,
    pending: isUpdateBusy(stage),
    onPress: () => {
      const current = mobileUpdates.store.getState()
      if (isUpdateBusy(current.stage)) {
        return
      }
      if (installable(current.stage)) {
        void mobileUpdates.install()
      } else if (current.stage === 'available' || (current.stage === 'error' && current.release)) {
        void downloadAndInstallUpdate()
      } else {
        void mobileUpdates.check(true)
      }
    }
  }
}
