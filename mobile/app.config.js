const { withIntegrationBuild } = require('../config/scripts/integration-builds/android-config.cjs')

module.exports = ({ config }) => withIntegrationBuild(config)
