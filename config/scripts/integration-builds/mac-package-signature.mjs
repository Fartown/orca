import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { signingCertificate } from './mac-signing.cjs'
import { assertPublisherRequirement } from './mac-signature-requirement.cjs'
export { assertPublisherRequirement } from './mac-signature-requirement.cjs'

export function verifyPackageSignature(
  application,
  { certificate, arch, version },
  execute = execFileSync
) {
  const expected = signingCertificate(certificate)
  if (!['arm64', 'x64'].includes(arch) || !version) {
    throw new Error('Missing package identity')
  }
  const temporary = mkdtempSync(join(tmpdir(), 'orca-package-certificate-'))
  const run = (binary, args, options = {}) =>
    execute(binary, args, { encoding: 'utf8', ...options })
  try {
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', application])
    const requirement = run('/usr/bin/codesign', ['-d', '-r-', application]).trim()
    assertPublisherRequirement(requirement, expected.sha1)
    const prefix = join(temporary, 'certificate-')
    run('/usr/bin/codesign', ['-d', `--extract-certificates=${prefix}`, application])
    const actual = new X509Certificate(readFileSync(`${prefix}0`))
    if (actual.fingerprint256.replaceAll(':', '').toLowerCase() !== expected.sha256) {
      throw new Error('App was signed by a different publisher')
    }
    const plist = join(application, 'Contents', 'Info.plist')
    const actualVersion = run('/usr/bin/plutil', [
      '-extract',
      'CFBundleShortVersionString',
      'raw',
      '-o',
      '-',
      plist
    ]).trim()
    if (actualVersion !== version) {
      throw new Error('Signed package version mismatch')
    }
    const actualArch = run(join(application, 'Contents', 'MacOS', 'Orca'), ['-p', 'process.arch'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ORCA_BACKGROUND_LAUNCH: '1' }
    }).trim()
    if (actualArch !== arch) {
      throw new Error('Signed package architecture mismatch')
    }
    return { schemaVersion: 1, arch, version, certificateSha256: expected.sha256, requirement }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [application, arch, output] = process.argv.slice(2)
  if (!application || !output) {
    throw new Error('Expected app path, architecture and evidence output')
  }
  const evidence = verifyPackageSignature(application, {
    certificate: readFileSync(new URL('./mac-publisher-certificate.pem', import.meta.url)),
    arch,
    version: process.env.ORCA_LOCAL_BUILD_VERSION
  })
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`)
}
