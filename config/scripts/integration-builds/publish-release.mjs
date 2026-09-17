import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { ANDROID_CERT_SHA256, integrationTag } from './build-identity.mjs'
import { listIntegrationReleases } from './integration-releases.mjs'
import { signingCertificate } from './mac-signing.cjs'
import { assertPublisherRequirement } from './mac-signature-requirement.cjs'

const MAX_CHANGES = 100

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

export function verifyMacSigningEvidence(directory, version) {
  const certificate = signingCertificate()
  for (const arch of ['arm64', 'x64']) {
    const evidence = JSON.parse(readFileSync(join(directory, `mac-signing-${arch}.json`), 'utf8'))
    if (
      evidence.schemaVersion !== 1 ||
      evidence.arch !== arch ||
      evidence.version !== version ||
      evidence.certificateSha256 !== certificate.sha256
    ) {
      throw new Error(`Invalid publisher signing evidence for ${arch}`)
    }
    assertPublisherRequirement(evidence.requirement, certificate.sha1)
  }
  return certificate.sha256
}

export function parseMergedChanges(log) {
  return log
    .split('\0')
    .map((message) => message.trim())
    .filter(Boolean)
    .map((message) => {
      const [subject, ...body] = message.split('\n')
      const merge = subject.match(/^Merge pull request #([1-9]\d*) from (\S+)$/)
      if (!merge) {
        return { title: shortTitle(subject) }
      }
      const title = body.map((line) => line.trim()).find(Boolean) ?? merge[2]
      return { number: Number(merge[1]), title: shortTitle(title) }
    })
}

function shortTitle(text) {
  const title = text.trim()
  return title.length > 200 ? `${title.slice(0, 199)}…` : title
}

function previousIntegrationRelease(releases, sha, runId) {
  return releases
    .filter(
      (release) =>
        release.run < Number(runId) &&
        /^[a-f0-9]{40}$/.test(release.target_commitish) &&
        release.target_commitish !== sha
    )
    .sort((a, b) => b.run - a.run)[0]
}

// First-parent history keeps upstream commits brought in by a sync merge out of the list.
export function listMergedChanges({ releases, git, sha, runId }) {
  const messages = (count, revisions) =>
    parseMergedChanges(
      git(['log', '--first-parent', `--max-count=${count}`, '--format=%B%x00', ...revisions, '--'])
    )
  try {
    const previous = previousIntegrationRelease(releases, sha, runId)
    if (previous) {
      git(['merge-base', '--is-ancestor', previous.target_commitish, sha])
      return {
        previous,
        changes: messages(MAX_CHANGES, [`${previous.target_commitish}..${sha}`])
      }
    }
  } catch (error) {
    console.warn(`Could not compare with the previous integration release: ${error.message}`)
  }
  return { previous: null, changes: messages(1, [sha]) }
}

function changeNotes(repo, sha, { previous, changes }) {
  if (!changes.length) {
    return []
  }
  const since = previous
    ? `（相比 [${previous.tag_name}](https://github.com/${repo}/releases/tag/${previous.tag_name})，[完整提交差异](https://github.com/${repo}/compare/${previous.target_commitish}...${sha})）`
    : '（未找到可对比的上一个集成包，只列出本次提交）'
  return [
    `**本次合入**${since}\n\n${changes
      .map((change) => `- ${change.number ? `#${change.number} ` : ''}${change.title}`)
      .join('\n')}`
  ]
}

export async function publishRelease({ env, directory, mobile, gh, git }) {
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
  const buildNumber = Number(version?.match(/^\d+\.\d+\.\d+-preview\.([1-9]\d*)$/)?.[1])
  if (!buildNumber) {
    throw new Error('The macOS version must be a numbered integration preview.')
  }
  const androidVersionCode = Number(env.ORCA_INTEGRATION_VERSION_CODE)
  if (
    !Number.isSafeInteger(androidVersionCode) ||
    androidVersionCode <= 16 ||
    androidVersionCode > 2100000000
  ) {
    throw new Error('Invalid integration Android versionCode.')
  }
  const repo = env.GITHUB_REPOSITORY
  const runUrl = `https://github.com/${repo}/actions/runs/${env.GITHUB_RUN_ID}`
  const assets = await hashPackages(directory)
  const macCertificateSha256 = verifyMacSigningEvidence(directory, version)
  const releases = listIntegrationReleases(gh, repo).filter((release) => release.tag_name !== tag)
  // The number was taken when this run started; a build published since then already owns it.
  if (
    buildNumber !== releases.length + 1 ||
    releases.some((release) => release.run > Number(env.GITHUB_RUN_ID))
  ) {
    throw new Error(
      `Integration build ${version} is stale: ${releases.length} builds are already published.`
    )
  }
  const merged = listMergedChanges({ releases, git, sha, runId: env.GITHUB_RUN_ID })
  const manifest = {
    schemaVersion: 2,
    sha,
    tag,
    runUrl,
    desktopVersion: version,
    androidVersion: mobile.expo.version,
    androidVersionCode,
    androidCertificateSha256: ANDROID_CERT_SHA256,
    macSigning: 'fixed self-signed publisher, not notarized',
    macCertificateSha256,
    assets,
    changes: merged.changes
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
      '集成分支内测包（非正式版）',
      ...changeNotes(repo, sha, merged),
      `Commit: ${sha}\n构建: ${runUrl}`,
      `macOS: ${version}\nAndroid: ${mobile.expo.version} (versionCode ${androidVersionCode})`,
      'macOS 提供 Apple Silicon / Intel DMG，使用固定 fork 自签身份、未公证；首次打开可能被系统拦截，需要手动允许，系统权限可能需要重新授予。',
      '提供双架构 ZIP 与 latest-mac.yml，支持同一固定签名身份之间的原生自动更新。现有 ad-hoc 旧版需先手动安装一次 DMG，之后可应用内下载并确认重启更新。',
      `macOS publisher certificate SHA-256: ${macCertificateSha256}`,
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
      `Orca ${version}`,
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
    gh: (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    git: (args) =>
      execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  })
}
