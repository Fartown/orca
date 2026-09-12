import { execFileSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createLocalBuildVersion } from '../build-mac-local.mjs'

export const ANDROID_CERT_SHA256 =
  'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'

export function integrationTag(sha, runId) {
  if (!/^[a-f0-9]{40}$/.test(sha) || !/^[1-9]\d*$/.test(runId)) {
    throw new Error('Expected a full Git SHA and GitHub run ID.')
  }
  return `integration-${runId}-${sha.slice(0, 12)}`
}

export function buildIdentity({ sha, runId, baseVersion, timestamp }) {
  return {
    sha,
    tag: integrationTag(sha, runId),
    version: createLocalBuildVersion(baseVersion, timestamp, sha)
  }
}

export function verifyAndroidCertificate(output) {
  const certificates =
    output.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []
  if (!certificates.length) {
    throw new Error('No APK signing certificate found in apksigner PEM output.')
  }
  for (const certificate of certificates) {
    verifyAndroidPublicCertificate(certificate)
  }
}

export function verifyAndroidPublicCertificate(certificate) {
  const fingerprint = new X509Certificate(certificate).fingerprint256
    .replaceAll(':', '')
    .toLowerCase()
  if (fingerprint !== ANDROID_CERT_SHA256) {
    throw new Error(`Android signing certificate changed: ${fingerprint}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (process.argv[2] === 'verify-apk') {
    verifyAndroidCertificate(readFileSync(process.argv[3], 'utf8'))
  } else if (process.argv[2] === 'verify-keystore') {
    verifyAndroidPublicCertificate(readFileSync(0))
  } else {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    if (sha !== process.env.GITHUB_SHA) {
      throw new Error('Checkout does not match workflow SHA.')
    }
    const identity = buildIdentity({
      sha,
      runId: process.env.GITHUB_RUN_ID,
      baseVersion: JSON.parse(readFileSync('package.json', 'utf8')).version,
      timestamp: Date.now()
    })
    for (const [key, value] of Object.entries(identity)) {
      console.log(`${key}=${value}`)
    }
  }
}
