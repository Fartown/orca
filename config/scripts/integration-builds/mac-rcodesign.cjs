const { createHash, X509Certificate } = require('node:crypto')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const { assertPublisherRequirement } = require('./mac-signature-requirement.cjs')

const VERSION = '0.29.0'
const RELEASE = `https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign/${VERSION}`
const RELEASES = {
  arm64: {
    target: 'aarch64-apple-darwin',
    sha256: 'd1a532150adaf90048260d76359261aa716abafc45c53c5dc18845029184334a'
  },
  x64: {
    target: 'x86_64-apple-darwin',
    sha256: '14ef11bedd51a8d95eafd767939ae96d5900e5a61511bef75bb21db6e7c74140'
  }
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 16 * 1024 * 1024,
    ...options
  })
  if (result.error || result.status !== 0) {
    throw new Error(`macOS signing command failed: ${result.stderr || result.error?.message}`)
  }
  return result
}

async function ensureRcodesign(directory) {
  const release = RELEASES[process.arch]
  if (process.platform !== 'darwin' || !release) {
    throw new Error('rcodesign packaging supports macOS arm64 and x64 only')
  }
  mkdirSync(directory, { recursive: true })
  const name = `apple-codesign-${VERSION}-${release.target}`
  const archive = join(directory, `${name}.tar.gz`)
  if (!existsSync(archive)) {
    const response = await fetch(`${RELEASE}/${name}.tar.gz`, {
      signal: AbortSignal.timeout(120_000)
    })
    if (!response.ok) {
      throw new Error(`rcodesign download failed: HTTP ${response.status}`)
    }
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()))
  }
  const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex')
  if (sha256 !== release.sha256) {
    throw new Error('rcodesign archive does not match the pinned official release checksum')
  }
  run('/usr/bin/tar', ['-xzf', archive, '-C', directory])
  const executable = join(directory, name, 'rcodesign')
  const version = run(executable, ['--version']).stdout.trim()
  if (!version.includes(VERSION)) {
    throw new Error('Unexpected rcodesign binary version')
  }
  writeFileSync(
    join(directory, 'rcodesign-provenance.json'),
    JSON.stringify(
      {
        version,
        sha256,
        url: `${RELEASE}/${name}.tar.gz`,
        checksumSource: `${RELEASE}/${name}.tar.gz.sha256`
      },
      null,
      2
    )
  )
  return executable
}

function signMacBundle({
  executable,
  appPath,
  certificatePath,
  privateKeyPath,
  evidenceDirectory
}) {
  const { captureSigningMetadata, assertSigningMetadata } = require('./mac-signing-metadata.cjs')
  mkdirSync(evidenceDirectory, { recursive: true })
  const before = captureSigningMetadata(appPath)
  const result = run(executable, [
    'sign',
    '--config-file',
    '/dev/null',
    '--pem-file',
    certificatePath,
    '--pem-file',
    privateKeyPath,
    '--timestamp-url',
    'none',
    appPath
  ])
  writeFileSync(join(evidenceDirectory, 'rcodesign.log'), `${result.stdout}\n${result.stderr}`)
  const after = captureSigningMetadata(appPath)
  writeFileSync(
    join(evidenceDirectory, 'metadata.json'),
    JSON.stringify({ before, after }, null, 2)
  )
  assertSigningMetadata(before, after)
  const fingerprint = new X509Certificate(readFileSync(certificatePath)).fingerprint
    .replaceAll(':', '')
    .toLowerCase()
  const designated = assertPublisherRequirement(
    run('/usr/bin/codesign', ['-d', '-r-', appPath]).stdout,
    fingerprint
  )
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath])
  return { designated, fingerprint }
}

module.exports = { ensureRcodesign, signMacBundle, RELEASES, VERSION }
