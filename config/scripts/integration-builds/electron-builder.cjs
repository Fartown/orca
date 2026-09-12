const upstream = require('../../electron-builder.config.cjs')

if (upstream.forceCodeSigning || !process.env.ORCA_LOCAL_BUILD_VERSION) {
  throw new Error(
    'Integration packaging requires a local version, not a release-channel environment.'
  )
}

module.exports = {
  ...upstream,
  mac: {
    ...upstream.mac,
    identity: '-',
    target: ['dmg']
  },
  dmg: {
    ...upstream.dmg,
    artifactName: 'orca-integration-macos-${arch}.${ext}'
  }
}
