const { join } = require('node:path')

async function signIntegrationPackage(context, env = process.env) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }
  const executable = env.ORCA_INTEGRATION_SIGN_EXECUTABLE
  const certificatePath = env.ORCA_INTEGRATION_SIGN_CERTIFICATE
  const privateKeyPath = env.ORCA_INTEGRATION_SIGN_PRIVATE_KEY
  const publishing =
    env.GITHUB_REF === 'refs/heads/fork/integration' &&
    ['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
  if (!executable && !certificatePath && !privateKeyPath && !publishing) {
    return
  }
  if (!executable || !certificatePath || !privateKeyPath) {
    throw new Error('Fixed publisher signing is required; refusing an ad-hoc release')
  }
  const { signMacBundle } = require('./mac-rcodesign.cjs')
  return signMacBundle({
    executable,
    appPath: join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`),
    certificatePath,
    privateKeyPath,
    evidenceDirectory: join(context.appOutDir, 'publisher-signing-evidence')
  })
}

module.exports = { signIntegrationPackage }
