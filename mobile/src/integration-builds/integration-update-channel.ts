import Constants from 'expo-constants'

/** Fork integration builds update through IntegrationUpdateGate, never upstream's release channels. */
export function isIntegrationUpdateChannel(): boolean {
  return Constants.expoConfig?.extra?.orcaUpdateChannel === 'integration'
}
