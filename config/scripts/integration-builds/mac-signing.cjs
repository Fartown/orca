const {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require('node:fs')
const { randomBytes, X509Certificate } = require('node:crypto')
const { join, resolve, dirname } = require('node:path')
const { spawnSync } = require('node:child_process')

const certificatePath = join(__dirname, 'mac-publisher-certificate.pem')

function command(args, options = {}) {
  const result = spawnSync('/usr/bin/security', args, {
    encoding: 'utf8',
    timeout: 60_000,
    ...options
  })
  if (result.error || result.status !== 0) {
    // Command arguments can contain passwords.
    throw new Error(`Signing keychain operation failed: ${result.stderr || result.error?.message}`)
  }
  return result.stdout
}

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
  const errors = []
  const attempt = (operation) => {
    try {
      operation()
    } catch (error) {
      errors.push(error)
    }
  }
  if (state.trustAdded) {
    attempt(() => command(['remove-trusted-cert', certificatePath]))
  }
  if (state.searchListChanged) {
    attempt(() => command(['list-keychains', '-d', 'user', '-s', ...state.searchList]))
  }
  const keychain = join(directory, 'publisher.keychain-db')
  if (existsSync(keychain)) {
    attempt(() => command(['delete-keychain', keychain]))
  }
  rmSync(directory, { recursive: true, force: true })
  if (errors.length) {
    throw new AggregateError(errors, 'Signing cleanup failed')
  }
  rmSync(stateFile)
}

function prepareSigning(env = process.env) {
  assertReleaseRunner(env)
  if (!env.ORCA_MAC_SIGN_P12_BASE64 || !env.ORCA_MAC_SIGN_P12_PASSWORD || !env.GITHUB_ENV) {
    throw new Error('Missing fixed macOS signing credentials; refusing ad-hoc release')
  }
  if (existsSync(statePath(env))) {
    throw new Error('A signing preparation already exists')
  }
  const certificate = signingCertificate()
  const directory = mkdtempSync(join(env.RUNNER_TEMP, 'orca-integration-signing-'))
  const keychain = join(directory, 'publisher.keychain-db')
  const p12 = join(directory, 'publisher.p12')
  const password = randomBytes(32).toString('hex')
  const searchList = [...command(['list-keychains', '-d', 'user']).matchAll(/"([^"\n]+)"/g)].map(
    (match) => match[1]
  )
  const state = { directory, searchList, trustAdded: false, searchListChanged: false }
  const save = () => writeFileSync(statePath(env), JSON.stringify(state), { mode: 0o600 })
  save()
  try {
    writeFileSync(p12, Buffer.from(env.ORCA_MAC_SIGN_P12_BASE64, 'base64'), { mode: 0o600 })
    command(['create-keychain', '-p', password, keychain])
    command(['set-keychain-settings', '-lut', '21600', keychain])
    command(['unlock-keychain', '-p', password, keychain])
    command([
      'import',
      p12,
      '-P',
      env.ORCA_MAC_SIGN_P12_PASSWORD,
      '-k',
      keychain,
      '-T',
      '/usr/bin/codesign'
    ])
    rmSync(p12)
    state.trustAdded = true
    save()
    command([
      'add-trusted-cert',
      '-r',
      'trustRoot',
      '-p',
      'codeSign',
      '-k',
      keychain,
      certificatePath
    ])
    command(['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', password, keychain])
    const identities = command(['find-identity', '-v', '-p', 'codesigning', keychain])
    if (!identities.includes(certificate.sha1)) {
      throw new Error('P12 does not match the fixed publisher certificate')
    }
    state.searchListChanged = true
    save()
    command(['list-keychains', '-d', 'user', '-s', keychain, ...searchList])
    const variables = {
      CSC_KEYCHAIN: keychain,
      CSC_NAME: certificate.sha1,
      ORCA_COMPUTER_MACOS_SIGN_IDENTITY: certificate.sha1,
      ORCA_INTEGRATION_SIGN_IDENTITY: certificate.sha1
    }
    appendFileSync(
      env.GITHUB_ENV,
      Object.entries(variables)
        .map(([key, value]) => `${key}=${value}\n`)
        .join('')
    )
    return certificate
  } catch (error) {
    try {
      cleanupSigning(env)
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Signing preparation and cleanup failed')
    }
    throw error
  }
}

module.exports = { assertReleaseRunner, cleanupSigning, prepareSigning, signingCertificate }

if (require.main === module) {
  const action = process.argv[2]
  if (action === 'prepare') {
    prepareSigning()
  } else if (action === 'cleanup') {
    cleanupSigning()
  } else {
    throw new Error('Expected prepare or cleanup')
  }
}
