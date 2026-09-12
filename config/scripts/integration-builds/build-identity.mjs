import { execFileSync } from 'node:child_process'
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
  const certificates = [...output.matchAll(/^Signer #\d+ certificate SHA-256 digest: (\w+)$/gm)]
  if (certificates.length !== 1 || certificates[0][1].toLowerCase() !== ANDROID_CERT_SHA256) {
    throw new Error('APK signer changed: expected the existing Expo internal-test certificate.')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (process.argv[2] === 'verify-apk') {
    verifyAndroidCertificate(readFileSync(process.argv[3], 'utf8'))
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
