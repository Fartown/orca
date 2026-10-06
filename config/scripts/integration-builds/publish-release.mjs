import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ANDROID_CERT_SHA256, integrationTag } from './build-identity.mjs'
import { commandOutput } from './command-output.mjs'
import { readAiSummary } from './ai-release-summary.mjs'
import { latestPreviewNumber, listReleases } from './integration-releases.mjs'
import { LEGACY_INTEL_PLACEHOLDER, legacyIntelPlaceholder } from './legacy-intel-placeholder.mjs'
import { signingCertificate } from './mac-signing.cjs'
import { assertPublisherRequirement } from './mac-signature-requirement.cjs'
import { milestoneNotes, milestoneUpstreamVersion, publishMilestone } from './milestone-release.mjs'
import { pruneBuildReleases } from './prune-releases.mjs'
import { releaseContext } from './release-context.mjs'
import {
  foldedSection,
  loadFeatureGroups,
  manifestChanges,
  renderChangeSections
} from './release-notes.mjs'

export const PACKAGE_NAMES = [
  'orca-integration-macos-arm64.dmg',
  'orca-integration-macos-arm64.zip',
  'orca-integration-android.apk'
]
const MAC_UPDATE_ZIP = 'orca-integration-macos-arm64.zip'

export async function hashPackages(directory, names = PACKAGE_NAMES) {
  const assets = []
  for (const name of names) {
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
  const evidence = JSON.parse(readFileSync(join(directory, 'mac-signing-arm64.json'), 'utf8'))
  if (
    evidence.schemaVersion !== 1 ||
    evidence.arch !== 'arm64' ||
    evidence.version !== version ||
    evidence.certificateSha256 !== certificate.sha256
  ) {
    throw new Error('Invalid publisher signing evidence for arm64')
  }
  assertPublisherRequirement(evidence.requirement, certificate.sha1)
  return certificate.sha256
}

const INSTALL_NOTES = [
  'macOS 只提供 Apple Silicon DMG，使用固定 fork 自签身份、未公证；首次打开可能被系统拦截，需要手动允许，系统权限可能需要重新授予。',
  '提供 Apple Silicon ZIP 与 latest-mac.yml，支持同一固定签名身份之间的原生自动更新。现有 ad-hoc 旧版需先手动安装一次 DMG，之后可应用内下载并确认重启更新。',
  `Intel 版已停止提供。${LEGACY_INTEL_PLACEHOLDER} 不是安装包，只是一份说明，让 2026-09-17 之前的集成包仍把本次发布识别为完整并继续自动更新。`,
  'Android 集成包自动检查 fork 更新，可在应用内下载 APK 后通过系统确认安装。旧版需先手动安装一次；不同签名安装不能覆盖。APK 使用 Expo debug 内测签名，不用于商店发布。',
  'build-info.json 和 SHA256SUMS.txt 记录来源及下载校验和。'
]

function bulletList(lines) {
  return lines.map((line) => `- ${line}`).join('\n')
}

function buildNotes(
  { repo, sha, version, runUrl, android, macCertificateSha256 },
  context,
  features
) {
  const { previous, buildChanges } = context
  const since = previous
    ? `相比 [${previous.tag_name}](https://github.com/${repo}/releases/tag/${previous.tag_name})：[完整提交差异](https://github.com/${repo}/compare/${previous.target_commitish}...${sha})`
    : '未找到可对比的上一个集成包，只列出本次提交'
  return `${[
    '集成分支内测包（非正式版）。',
    ...renderChangeSections({
      changes: buildChanges,
      features,
      syncSummaries: context.syncSummariesOf(buildChanges)
    }),
    foldedSection(
      '安装、签名与校验',
      bulletList([
        ...INSTALL_NOTES,
        `macOS publisher certificate SHA-256: \`${macCertificateSha256}\``,
        `Android certificate SHA-256: \`${ANDROID_CERT_SHA256}\``
      ])
    ),
    foldedSection(
      '构建信息',
      bulletList([
        `版本：macOS ${version}；Android ${android.version}（versionCode ${android.versionCode}）`,
        `提交：[\`${sha.slice(0, 12)}\`](https://github.com/${repo}/commit/${sha})`,
        `构建：${runUrl}`,
        since
      ])
    )
  ].join('\n\n')}\n`
}

/** Milestone and pruning run after the build is public, so neither can hold the build back. */
function finishPublication({
  gh,
  repo,
  sha,
  tag,
  version,
  baseVersion,
  runId,
  context,
  features,
  directory,
  summaryDirectory
}) {
  const milestones = [...context.milestones]
  if (context.plan) {
    try {
      const syncSummaries = context.syncSummariesOf(context.plan.changes)
      const notes = milestoneNotes({
        repo,
        sha,
        plan: context.plan,
        features,
        syncSummaries,
        aiSummary: readAiSummary(summaryDirectory),
        build: { tag, version }
      })
      const milestoneTag = publishMilestone({
        gh,
        repo,
        sha,
        upstreamVersion: milestoneUpstreamVersion({
          syncSummaries,
          previous: context.plan.previous,
          packageVersion: baseVersion
        }),
        milestones: context.milestones,
        notes,
        notesPath: join(directory, 'milestone-notes.md')
      })
      milestones.push({ tag_name: milestoneTag, body: notes })
    } catch (error) {
      console.log(`::warning::Could not publish the milestone release: ${error.message}`)
    }
  }
  pruneBuildReleases({
    gh,
    repo,
    builds: [{ tag_name: tag, run: Number(runId) }, ...context.builds],
    milestones
  })
}

export async function publishRelease({
  env,
  directory,
  mobile,
  gh,
  git,
  features = loadFeatureGroups(),
  summaryDirectory
}) {
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
  const context = releaseContext({
    gh,
    git,
    releases: listReleases(gh, repo),
    sha,
    runId: env.GITHUB_RUN_ID,
    milestoneRequested: env.ORCA_INTEGRATION_MILESTONE === 'true'
  })
  const latest = latestPreviewNumber(context.builds)
  // The number was taken when this run started; a build published since then already owns it.
  if (
    buildNumber !== latest + 1 ||
    context.builds.some((release) => release.run > Number(env.GITHUB_RUN_ID))
  ) {
    throw new Error(
      `Integration build ${version} is stale: preview.${latest} is already published.`
    )
  }
  const syncSummaries = context.syncSummariesOf(context.buildChanges)
  writeFileSync(join(directory, LEGACY_INTEL_PLACEHOLDER), legacyIntelPlaceholder())
  const published = [...assets, ...(await hashPackages(directory, [LEGACY_INTEL_PLACEHOLDER]))]
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
    assets: published,
    changes: manifestChanges(context.buildChanges, syncSummaries)
  }
  writeFileSync(join(directory, 'build-info.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(directory, 'latest-mac.yml'), macUpdateManifest(version, assets))
  writeFileSync(
    join(directory, 'SHA256SUMS.txt'),
    published.map((a) => `${a.sha256}  ${a.name}\n`).join('')
  )
  const baseVersion = version.replace(/-preview\.\d+$/, '')
  const notesPath = join(directory, 'release-notes.md')
  writeFileSync(
    notesPath,
    buildNotes(
      {
        repo,
        sha,
        version,
        runUrl,
        android: { version: mobile.expo.version, versionCode: androidVersionCode },
        macCertificateSha256
      },
      context,
      features
    )
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
      // latestPreviewNumber reads the build number back from this title.
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
    ...[
      ...PACKAGE_NAMES,
      LEGACY_INTEL_PLACEHOLDER,
      'latest-mac.yml',
      'build-info.json',
      'SHA256SUMS.txt'
    ].map((name) => join(directory, name))
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
  finishPublication({
    gh,
    repo,
    sha,
    tag,
    version,
    baseVersion,
    runId: env.GITHUB_RUN_ID,
    context,
    features,
    directory,
    summaryDirectory
  })
}

export function macUpdateManifest(version, assets) {
  const files = assets.filter((asset) => asset.name === MAC_UPDATE_ZIP)
  if (files.length !== 1) {
    throw new Error('The Apple Silicon update ZIP is required.')
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
    gh: commandOutput('gh'),
    git: commandOutput('git'),
    summaryDirectory: process.argv[3] && resolve(process.argv[3])
  })
}
