function androidVersionCode(timestamp) {
  const code = Math.floor(Number(timestamp) / 1000) - 1577836800
  if (!Number.isSafeInteger(code) || code <= 16 || code > 2100000000) {
    throw new Error('Integration timestamp is outside the Android versionCode range.')
  }
  return code
}

function withIntegrationBuild(config, env = process.env) {
  if (!env.ORCA_INTEGRATION_VERSION_CODE) {
    return config
  }
  const versionCode = Number(env.ORCA_INTEGRATION_VERSION_CODE)
  if (!Number.isSafeInteger(versionCode) || versionCode <= 16 || versionCode > 2100000000) {
    throw new Error('Invalid integration Android versionCode.')
  }
  return {
    ...config,
    android: {
      ...config.android,
      versionCode,
      permissions: [
        ...new Set([...(config.android?.permissions ?? []), 'REQUEST_INSTALL_PACKAGES'])
      ]
    },
    extra: { ...config.extra, orcaUpdateChannel: 'integration' }
  }
}

module.exports = { androidVersionCode, withIntegrationBuild }
