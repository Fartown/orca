import { mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, X509Certificate } from 'node:crypto'
import { assertHostedMac } from './probe-policy.mjs'
import { command, writeJson } from './probe-command.mjs'

export function createProbeIdentities(output) {
  assertHostedMac()
  const directory = mkdtempSync(join(process.env.RUNNER_TEMP, 'orca-signing-probe-keys-'))
  const keychain = join(directory, 'probe.keychain-db')
  const password = randomBytes(32).toString('hex')
  const identities = []
  const before = command('/usr/bin/security', ['list-keychains', '-d', 'user']).stdout
  let keychainCreated = false
  let cleaned = false

  function removeTrust() {
    const errors = []
    for (const identity of identities) {
      if (!identity.trusted) {
        continue
      }
      const result = command('/usr/bin/security', ['remove-trusted-cert', identity.certificate], {
        allowFailure: true
      })
      if (result.status === 0) {
        identity.trusted = false
      } else {
        errors.push(`${identity.label}: ${result.stderr}`)
      }
    }
    if (errors.length) {
      throw new Error(`Could not remove probe trust: ${errors.join('; ')}`)
    }
  }

  function cleanup() {
    if (cleaned) {
      return
    }
    const errors = []
    try {
      removeTrust()
    } catch (error) {
      errors.push(String(error))
    }
    if (keychainCreated && existsSync(keychain)) {
      const result = command('/usr/bin/security', ['delete-keychain', keychain], {
        allowFailure: true
      })
      if (result.status !== 0) {
        errors.push(result.stderr)
      }
    }
    const after = command('/usr/bin/security', ['list-keychains', '-d', 'user']).stdout
    if (before !== after) {
      errors.push('User keychain search list changed')
    }
    rmSync(directory, { recursive: true, force: true })
    cleaned = true
    writeJson(join(output, 'identity-cleanup.json'), {
      privateMaterialRemoved: !existsSync(directory),
      trustRemoved: identities.every((item) => !item.trusted),
      keychainSearchListUnchanged: before === after,
      errors
    })
    if (errors.length) {
      throw new Error(`Identity cleanup failed: ${errors.join('; ')}`)
    }
  }

  try {
    command('/usr/bin/security', ['create-keychain', '-p', password, keychain])
    keychainCreated = true
    command('/usr/bin/security', ['unlock-keychain', '-p', password, keychain])
    for (const label of ['publisher', 'other-publisher']) {
      const key = join(directory, `${label}.key`)
      const certificate = join(directory, `${label}.pem`)
      const config = join(directory, `${label}.cnf`)
      writeFileSync(
        config,
        `[req]\ndistinguished_name=subject\nx509_extensions=signing\nprompt=no\n[subject]\nCN=Orca CI Probe ${label} ${randomBytes(8).toString('hex')}\n[signing]\nbasicConstraints=critical,CA:true\nkeyUsage=critical,digitalSignature,keyCertSign\nextendedKeyUsage=critical,codeSigning\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n`
      )
      command('/usr/bin/openssl', [
        'req',
        '-new',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-x509',
        '-days',
        '2',
        '-config',
        config,
        '-keyout',
        key,
        '-out',
        certificate
      ])
      const cert = new X509Certificate(readFileSync(certificate))
      const identity = {
        label,
        certificate,
        fingerprint: cert.fingerprint.replaceAll(':', ''),
        sha256: cert.fingerprint256.replaceAll(':', ''),
        trusted: false
      }
      identities.push(identity)
      command('/usr/bin/security', ['import', key, '-k', keychain, '-T', '/usr/bin/codesign'])
      command('/usr/bin/security', ['import', certificate, '-k', keychain])
      identity.trusted = true
      command('/usr/bin/security', [
        'add-trusted-cert',
        '-r',
        'trustRoot',
        '-p',
        'codeSign',
        '-k',
        keychain,
        certificate
      ])
      copyFileSync(certificate, join(output, `${label}-public-certificate.pem`))
    }
    command('/usr/bin/security', [
      'set-key-partition-list',
      '-S',
      'apple-tool:,apple:',
      '-s',
      '-k',
      password,
      keychain
    ])
    writeJson(
      join(output, 'certificates.json'),
      identities.map(({ label, fingerprint, sha256 }) => ({ label, fingerprint, sha256 }))
    )
    return {
      identities,
      keychain,
      cleanup,
      removeTrustBeforeRuntime() {
        removeTrust()
        const checks = identities.map((identity) => ({
          label: identity.label,
          verification: command(
            '/usr/bin/security',
            ['verify-cert', '-c', identity.certificate, '-p', 'codeSign'],
            { allowFailure: true }
          )
        }))
        writeJson(join(output, 'client-trust-removed.json'), checks)
        if (checks.some((check) => check.verification.status === 0)) {
          throw new Error('Client certificate unexpectedly remains trusted')
        }
      }
    }
  } catch (error) {
    try {
      cleanup()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Probe identity setup and cleanup failed: ${String(error)}; ${String(cleanupError)}`
      )
    }
    throw error
  }
}
