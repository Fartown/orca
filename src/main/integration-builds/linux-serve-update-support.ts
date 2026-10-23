import { resolveAppImageRuntimeIdentity } from '../appimage-runtime-identity'

export function hasLinuxServeUpdateSupervisor(): boolean {
  return (
    process.platform === 'linux' &&
    process.connected === true &&
    resolveAppImageRuntimeIdentity() !== null
  )
}
