import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function verifyAndroidPackageVersion(badging, config, versionCode) {
  if (
    !Number.isSafeInteger(versionCode) ||
    versionCode <= 16 ||
    !badging.includes("name='com.stably.orca.mobile'") ||
    !badging.includes(`versionCode='${versionCode}'`) ||
    config.android?.versionCode !== versionCode ||
    config.extra?.orcaUpdateChannel !== 'integration'
  ) {
    throw new Error(
      'Built APK package/version/update channel does not match the integration identity.'
    )
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  verifyAndroidPackageVersion(
    readFileSync(process.argv[2], 'utf8'),
    JSON.parse(readFileSync(process.argv[3], 'utf8')),
    Number(process.env.ORCA_INTEGRATION_VERSION_CODE)
  )
}
