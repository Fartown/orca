import { resolveAppImageRuntimeIdentity } from '../appimage-runtime-identity'
import { getLinuxPackageType } from '../linux-update-package-type'

export function linuxAppImageUpdateUnavailableMessage(): string | null {
  if (
    process.platform !== 'linux' ||
    getLinuxPackageType() !== 'non-root' ||
    resolveAppImageRuntimeIdentity() !== null
  ) {
    return null
  }
  return 'Automatic updates are unavailable because Orca was started without a valid AppImage source. Reopen Orca from its original AppImage.'
}
