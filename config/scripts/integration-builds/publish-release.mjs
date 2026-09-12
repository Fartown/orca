import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { ANDROID_CERT_SHA256, integrationTag } from './build-identity.mjs'
import androidConfig from './android-config.cjs'

export const PACKAGE_NAMES = [
  'orca-integration-macos-arm64.dmg',
  'orca-integration-macos-x64.dmg',
  'orca-integration-macos-arm64.zip',
  'orca-integration-macos-x64.zip',
  'orca-integration-android.apk'
]

export async function hashPackages(directory) {
  const assets = []
  for (const name of PACKAGE_NAMES) {
    const path = join(directory, name)
    const stat = statSync(path)
    if (!stat.isFile() || stat.size === 0) {
      throw new Error(`Missing or empty package: ${name}`)
    }
    const hash = createHash('sha256')
    const updateHash = createHash('sha512')
    for await (const chunk of createReadStream(path)) {
      hash.update(chunk)
      updateHash.update(chunk)
    }
    assets.push({
      name,
      bytes: stat.size,
      sha256: hash.digest('hex'),
      sha512: updateHash.digest('base64')
    })
  }
  return assets
}

export async function publishRelease({ env, directory, mobile, gh }) {
  if (
    env.GITHUB_REPOSITORY !== 'Fartown/orca' ||
    env.GITHUB_REF !== 'refs/heads/fork/integration' ||
    !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
  ) {
    throw new Error('Only the fork integration branch may publish integration packages.')
  }
  const sha = env.GITHUB_SHA
  const tag = integrationTag(sha, env.GITHUB_RUN_ID)
  const version = env.ORCA_LOCAL_BUILD_VERSION
  if (!version?.includes('-') || !version.endsWith(`.${sha.slice(0, 12)}`)) {
    throw new Error('The macOS version must identify this exact commit.')
  }
  const repo = env.GITHUB_REPOSITORY
  const runUrl = `https://github.com/${repo}/actions/runs/${env.GITHUB_RUN_ID}`
  const assets = await hashPackages(directory)
  const timestamp = Number(version.match(/-local\.(\d+)\./)?.[1])
  const androidVersionCode = androidConfig.androidVersionCode(timestamp)
  const manifest = {
    schemaVersion: 2,
    sha,
    tag,
    runUrl,
    desktopVersion: version,
    androidVersion: mobile.expo.version,
    androidVersionCode,
    androidCertificateSha256: ANDROID_CERT_SHA256,
    macSigning: 'ad-hoc, not notarized',
    assets
  }
  writeFileSync(join(directory, 'build-info.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(directory, 'latest-mac.yml'), macUpdateManifest(version, assets))
  writeFileSync(
    join(directory, 'SHA256SUMS.txt'),
    assets.map((a) => `${a.sha256}  ${a.name}\n`).join('')
  )
  const notesPath = join(directory, 'release-notes.md')
  writeFileSync(
    notesPath,
    `${[
      `集成分支内测包（非正式版）\n\nCommit: ${sha}\n构建: ${runUrl}`,
      `macOS: ${version}\nAndroid: ${mobile.expo.version} (versionCode ${androidVersionCode})`,
      'macOS 提供 Apple Silicon / Intel DMG，ad-hoc 签名、未公证，首次打开可能被系统拦截，需要手动允许；系统权限可能需要重新授予。',
      '提供双架构 ZIP 与 latest-mac.yml；macOS ad-hoc 签名无法通过原生自动更新的跨版本签名校验，仍需手动安装 DMG。',
      'Android 集成包自动检查 fork 更新，可在应用内下载 APK 后通过系统确认安装。旧版需先手动安装一次；不同签名安装不能覆盖。APK 使用 Expo debug 内测签名，不用于商店发布。',
      `Android certificate SHA-256: ${ANDROID_CERT_SHA256}`,
      'build-info.json 和 SHA256SUMS.txt 记录来源及下载校验和。'
    ].join('\n\n')}\n`
  )

  let existing
  try {
    existing = JSON.parse(gh(['api', `repos/${repo}/releases/tags/${tag}`]))
  } catch (error) {
    if (!String(error.stderr).includes('HTTP 404')) {
      throw error
    }
  }
  if (existing) {
    if (existing.target_commitish !== sha || !existing.prerelease) {
      throw new Error('Existing release identity does not match this integration build.')
    }
    if (!existing.draft) {
      throw new Error('Already published; refusing to overwrite immutable integration assets.')
    }
  } else {
    gh([
      'release',
      'create',
      tag,
      '--repo',
      repo,
      '--target',
      sha,
      '--draft',
      '--prerelease',
      '--latest=false',
      '--title',
      `Orca Integration ${sha.slice(0, 12)}`,
      '--notes-file',
      notesPath
    ])
  }
  gh([
    'release',
    'upload',
    tag,
    '--repo',
    repo,
    '--clobber',
    ...[...PACKAGE_NAMES, 'latest-mac.yml', 'build-info.json', 'SHA256SUMS.txt'].map((name) =>
      join(directory, name)
    )
  ])
  gh([
    'release',
    'edit',
    tag,
    '--repo',
    repo,
    '--draft=false',
    '--prerelease',
    '--latest=false',
    '--notes-file',
    notesPath
  ])
  console.log(`https://github.com/${repo}/releases/tag/${tag}`)
}

export function macUpdateManifest(version, assets) {
  const files = assets.filter((asset) => asset.name.endsWith('.zip'))
  if (files.length !== 2) {
    throw new Error('Both macOS update ZIPs are required.')
  }
  return [
    `version: ${JSON.stringify(version)}`,
    'files:',
    ...files.flatMap((file) => [
      `  - url: ${file.name}`,
      `    sha512: ${file.sha512}`,
      `    size: ${file.bytes}`
    ]),
    `path: ${files[0].name}`,
    `sha512: ${files[0].sha512}`,
    ''
  ].join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await publishRelease({
    env: process.env,
    directory: resolve(process.argv[2]),
    mobile: JSON.parse(readFileSync('mobile/app.json', 'utf8')),
    gh: (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  })
}
