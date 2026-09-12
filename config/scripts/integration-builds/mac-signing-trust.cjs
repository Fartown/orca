const { spawnSync } = require('node:child_process')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { isDeepStrictEqual } = require('node:util')

const TRUST_RIGHT = 'com.apple.trust-settings.user'

function execute(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    ...options
  })
  if (result.error || (result.status !== 0 && !options.allowFailure)) {
    throw new Error(`Signing trust operation failed: ${result.stderr || result.error?.message}`)
  }
  return result
}

function isAbsentTrustRemoval(result) {
  return (
    result.status !== 0 &&
    /SecTrustSettingsRemoveTrustSettings: The specified item could not be found in the keychain\./.test(
      result.stderr ?? ''
    ) &&
    !result.error
  )
}

function changeCodeSigningTrust({
  certificate,
  keychain,
  remove = false,
  evidenceDirectory,
  label,
  run = execute,
  env = process.env,
  platform = process.platform
}) {
  if (
    platform !== 'darwin' ||
    env.GITHUB_ACTIONS !== 'true' ||
    env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    !env.RUNNER_TEMP
  ) {
    throw new Error('Noninteractive signing trust is restricted to ephemeral hosted macOS runners')
  }
  if (!/^[a-z0-9-]+$/.test(label) || !evidenceDirectory) {
    throw new Error('Signing trust requires a named evidence directory')
  }
  mkdirSync(evidenceDirectory, { recursive: true })
  const security = (args, options) => run('/usr/bin/security', args, options)
  const sudoSecurity = (args, options) =>
    run('/usr/bin/sudo', ['-n', '/usr/bin/security', ...args], options)
  const parsePlist = (input) =>
    JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input }).stdout)
  const original = security(['authorizationdb', 'read', TRUST_RIGHT]).stdout
  const originalPolicy = parsePlist(original)
  writeFileSync(join(evidenceDirectory, `${label}-before.plist`), original)
  const errors = []
  let absent = false
  let restored = false
  console.log(`[signing-trust] ${label}: temporary authorization for ${TRUST_RIGHT}`)
  try {
    sudoSecurity(['authorizationdb', 'write', TRUST_RIGHT, 'allow'])
    const args = remove
      ? ['remove-trusted-cert', certificate]
      : ['add-trusted-cert', '-r', 'trustRoot', '-p', 'codeSign', '-k', keychain, certificate]
    const result = security(args, { allowFailure: remove })
    absent = remove && isAbsentTrustRemoval(result)
    if (result.status !== 0 && !absent) {
      throw new Error(`Certificate trust mutation failed: ${result.stderr}`)
    }
  } catch (error) {
    errors.push(error)
  } finally {
    try {
      console.log(`[signing-trust] ${label}: restoring original authorization policy`)
      sudoSecurity(['authorizationdb', 'write', TRUST_RIGHT], { input: original })
      const after = security(['authorizationdb', 'read', TRUST_RIGHT]).stdout
      writeFileSync(join(evidenceDirectory, `${label}-after.plist`), after)
      restored = isDeepStrictEqual(originalPolicy, parsePlist(after))
      if (!restored) {
        errors.push(
          new Error('Restored signing trust authorization does not match the original policy')
        )
      }
    } catch (error) {
      errors.push(error)
    }
    writeFileSync(
      join(evidenceDirectory, `${label}-result.json`),
      JSON.stringify(
        { right: TRUST_RIGHT, remove, absent, restored, errors: errors.map(String) },
        null,
        2
      )
    )
  }
  if (errors.length) {
    throw new AggregateError(
      errors,
      `Signing trust operation failed: ${errors.map(String).join('; ')}`
    )
  }
  return { absent, restored }
}

module.exports = { changeCodeSigningTrust, isAbsentTrustRemoval }
