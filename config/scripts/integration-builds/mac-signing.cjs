const {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require('node:fs')
const { createPrivateKey, createPublicKey, X509Certificate } = require('node:crypto')
const { join, resolve, dirname } = require('node:path')

const certificatePath = join(__dirname, 'mac-publisher-certificate.pem')

function signingCertificate(contents = readFileSync(certificatePath)) {
  const certificate = new X509Certificate(contents)
  if (Date.parse(certificate.validTo) <= Date.now()) {
    throw new Error('Signing certificate expired')
  }
  return {
    sha1: certificate.fingerprint.replaceAll(':', ''),
    sha256: certificate.fingerprint256.replaceAll(':', '').toLowerCase()
  }
}

function assertReleaseRunner(env = process.env, platform = process.platform) {
  if (
    platform !== 'darwin' ||
    env.GITHUB_ACTIONS !== 'true' ||
    env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    !env.RUNNER_TEMP ||
    env.GITHUB_REPOSITORY !== 'Fartown/orca' ||
    env.GITHUB_REF !== 'refs/heads/fork/integration' ||
    !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
  ) {
    throw new Error('Release signing is restricted to the hosted fork integration runner')
  }
}

function statePath(env) {
  return join(env.RUNNER_TEMP, 'orca-integration-signing-state.json')
}

function cleanupSigning(env = process.env) {
  assertReleaseRunner(env)
  const stateFile = statePath(env)
  if (!existsSync(stateFile)) {
    return
  }
  const state = JSON.parse(readFileSync(stateFile, 'utf8'))
  const directory = resolve(state.directory)
  if (
    dirname(directory) !== resolve(env.RUNNER_TEMP) ||
    !directory.startsWith(join(resolve(env.RUNNER_TEMP), 'orca-integration-signing-'))
  ) {
    throw new Error('Invalid signing cleanup directory')
  }
  rmSync(directory, { recursive: true, force: true })
  rmSync(stateFile)
}

function decodePublisherKey(certificate, encryptedKey, password) {
  const key = createPrivateKey({ key: encryptedKey, passphrase: password })
  const encoding = { type: 'spki', format: 'der' }
  if (
    !createPublicKey(key)
      .export(encoding)
      .equals(new X509Certificate(certificate).publicKey.export(encoding))
  ) {
    throw new Error('Private key does not match the fixed publisher certificate')
  }
  return key.export({ type: 'pkcs8', format: 'pem' })
}

async function prepareSigning(env = process.env) {
  assertReleaseRunner(env)
  if (!env.ORCA_MAC_SIGN_PRIVATE_KEY_PEM || !env.ORCA_MAC_SIGN_KEY_PASSWORD || !env.GITHUB_ENV) {
    throw new Error('Missing fixed macOS signing credentials; refusing ad-hoc release')
  }
  if (existsSync(statePath(env))) {
    throw new Error('A signing preparation already exists')
  }
  const certificate = readFileSync(certificatePath)
  const identity = signingCertificate(certificate)
  const key = decodePublisherKey(
    certificate,
    env.ORCA_MAC_SIGN_PRIVATE_KEY_PEM,
    env.ORCA_MAC_SIGN_KEY_PASSWORD
  )
  const directory = mkdtempSync(join(env.RUNNER_TEMP, 'orca-integration-signing-'))
  writeFileSync(statePath(env), JSON.stringify({ directory }), { mode: 0o600 })
  try {
    const privateKeyPath = join(directory, 'publisher-key.pem')
    writeFileSync(privateKeyPath, key, { mode: 0o600 })
    const { ensureRcodesign } = require('./mac-rcodesign.cjs')
    const executable = await ensureRcodesign(join(env.RUNNER_TEMP, 'integration-signing-tools'))
    const variables = {
      ORCA_INTEGRATION_SIGN_PRIVATE_KEY: privateKeyPath,
      ORCA_INTEGRATION_SIGN_CERTIFICATE: certificatePath,
      ORCA_INTEGRATION_SIGN_EXECUTABLE: executable
    }
    appendFileSync(
      env.GITHUB_ENV,
      Object.entries(variables)
        .map(([name, value]) => `${name}=${value}\n`)
        .join('')
    )
    return identity
  } catch (error) {
    cleanupSigning(env)
    throw error
  }
}

module.exports = {
  assertReleaseRunner,
  cleanupSigning,
  decodePublisherKey,
  prepareSigning,
  signingCertificate
}

if (require.main === module) {
  const action = process.argv[2]
  if (action === 'prepare') {
    prepareSigning().catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
  } else if (action === 'cleanup') {
    cleanupSigning()
  } else {
    throw new Error('Expected prepare or cleanup')
  }
}
