const upstream = require('../../electron-builder.config.cjs')

if (upstream.forceCodeSigning || !process.env.ORCA_LOCAL_BUILD_VERSION) {
  throw new Error(
    'Integration packaging requires a local version, not a release-channel environment.'
  )
}
if (!/^integration-[1-9]\d*-[a-f0-9]{12}$/.test(process.env.ORCA_INTEGRATION_TAG ?? '')) {
  throw new Error('Integration packaging requires a concrete integration release tag.')
}

module.exports = {
  ...upstream,
  extraMetadata: { ...upstream.extraMetadata, orcaUpdateChannel: 'integration' },
  publish: {
    provider: 'generic',
    url: `https://github.com/Fartown/orca/releases/download/${process.env.ORCA_INTEGRATION_TAG}`
  },
  mac: {
    ...upstream.mac,
    identity: '-',
    target: ['dmg', 'zip'],
    artifactName: 'orca-integration-macos-${arch}.${ext}'
  },
  dmg: {
    ...upstream.dmg,
    artifactName: 'orca-integration-macos-${arch}.${ext}'
  }
}
