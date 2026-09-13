import { mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes, X509Certificate, createHash } from 'node:crypto'
import { assertIsolatedMac } from './probe-policy.mjs'
import { command, writeJson } from './probe-command.mjs'

export function createProbeIdentities(output) {
  assertIsolatedMac(output)
  const directory = mkdtempSync(
    join(process.env.RUNNER_TEMP ?? tmpdir(), 'orca-signing-probe-keys-')
  )
  const identities = []
  const before = command('/usr/bin/security', ['list-keychains', '-d', 'user']).stdout
  const trustSnapshot = () =>
    ['user', 'admin'].map((domain) => {
      const result = command(
        '/usr/bin/security',
        ['dump-trust-settings', ...(domain === 'admin' ? ['-d'] : [])],
        { allowFailure: true }
      )
      return {
        domain,
        status: result.status,
        sha256: createHash('sha256')
          .update(result.stdout + result.stderr)
          .digest('hex')
      }
    })
  const trustBefore = trustSnapshot()
  let cleaned = false
  function cleanup() {
    if (cleaned) {
      return
    }
    rmSync(directory, { recursive: true, force: true })
    cleaned = true
    const after = command('/usr/bin/security', ['list-keychains', '-d', 'user']).stdout
    const trustAfter = trustSnapshot()
    const trustUnchanged = JSON.stringify(trustBefore) === JSON.stringify(trustAfter)
    writeJson(join(output, 'identity-cleanup.json'), {
      privateMaterialRemoved: !existsSync(directory),
      trustChanged: false,
      keychainCreated: false,
      keychainSearchListUnchanged: before === after,
      trustUnchanged,
      trustBefore,
      trustAfter
    })
    if (before !== after || !trustUnchanged) {
      throw new Error('User keychain search list or trust settings changed')
    }
  }
  try {
    for (const label of ['publisher', 'other-publisher']) {
      console.log(`[signing] Generating PEM-only ${label}; no keychain or trust mutation`)
      const privateKey = join(directory, `${label}.key`)
      const certificate = join(directory, `${label}.pem`)
      const config = join(directory, `${label}.cnf`)
      writeFileSync(
        config,
        `[req]\ndistinguished_name=subject\nx509_extensions=signing\nprompt=no\n[subject]\nCN=Orca CI Probe ${label} ${randomBytes(8).toString('hex')}\n[signing]\nbasicConstraints=critical,CA:true\nkeyUsage=critical,digitalSignature,keyCertSign\nextendedKeyUsage=critical,codeSigning\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n`,
        { mode: 0o600 }
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
        privateKey,
        '-out',
        certificate
      ])
      const cert = new X509Certificate(readFileSync(certificate))
      identities.push({
        label,
        certificate,
        privateKey,
        fingerprint: cert.fingerprint.replaceAll(':', ''),
        sha256: cert.fingerprint256.replaceAll(':', '')
      })
      copyFileSync(certificate, join(output, `${label}-public-certificate.pem`))
    }
    writeJson(
      join(output, 'certificates.json'),
      identities.map(({ label, fingerprint, sha256 }) => ({ label, fingerprint, sha256 }))
    )
    return {
      identities,
      cleanup,
      removeTrustBeforeRuntime() {
        const checks = identities.map((identity) => ({
          label: identity.label,
          verification: command(
            '/usr/bin/security',
            ['verify-cert', '-c', identity.certificate, '-p', 'codeSign'],
            { allowFailure: true }
          )
        }))
        writeJson(join(output, 'client-trust-removed.json'), { trustNeverAdded: true, checks })
        if (checks.some((check) => check.verification.status === 0)) {
          throw new Error('Disposable client certificate unexpectedly trusted')
        }
      }
    }
  } catch (error) {
    cleanup()
    throw error
  }
}
