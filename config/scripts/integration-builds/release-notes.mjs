// Turns the integration branch's first-parent history into release notes a person can read.
import { readFileSync } from 'node:fs'

const ENGINEERING_TYPES = new Set([
  'test',
  'docs',
  'ci',
  'build',
  'chore',
  'style',
  'refactor',
  'release'
])
const TYPE_LABELS = { feat: '新功能', fix: '修复', perf: '性能', revert: '回退' }
// Scopes that name a feature by something other than its registry id.
const SCOPE_ALIASES = { issues: 'issues-board' }
const PR_SUBJECT = /^Merge pull request #([1-9]\d*) from (\S+)$/
const SYNC_SUBJECT =
  /^Merge (?:remote-tracking branch '(?:origin|upstream)\/main'|upstream main)(?:\s|$)/
const CONVENTIONAL = /^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/
export const OTHER_GROUP = '其他'
const MAX_MANIFEST_CHANGES = 100
const MAX_MANIFEST_TITLE = 300

/** First-parent commits in `range`, newest first, as `{ sha, parents, message }`. */
export function readFirstParentCommits(git, range, maxCount = 500) {
  return git([
    'log',
    '--first-parent',
    `--max-count=${maxCount}`,
    '--format=%H%x1f%P%x1f%B%x00',
    range,
    '--'
  ])
    .split('\0')
    .map((entry) => entry.replace(/^\n+/, ''))
    .filter((entry) => entry.trim())
    .map((entry) => {
      const [sha, parents, message] = entry.split('\x1f')
      return { sha: sha.trim(), parents: parents.trim().split(/\s+/).filter(Boolean), message }
    })
}

export function parseConventional(title) {
  const match = title.match(CONVENTIONAL)
  if (!match) {
    return { type: null, scopes: [], summary: title }
  }
  return {
    type: match[1],
    scopes: (match[2] ?? '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean),
    summary: match[3].trim()
  }
}

// Unknown types count as user-facing so a mislabelled fix is shown rather than folded away.
function isUserFacing(type) {
  return type === null || !ENGINEERING_TYPES.has(type)
}

export function classifyCommit({ sha, parents, message }) {
  const lines = message.split('\n')
  const subject = lines[0].trim()
  const pr = subject.match(PR_SUBJECT)
  if (pr) {
    const title =
      lines
        .slice(1)
        .map((line) => line.trim())
        .find(Boolean) ?? pr[2]
    return withType({ kind: 'pr', sha, number: Number(pr[1]), title })
  }
  if (SYNC_SUBJECT.test(subject) && parents.length === 2) {
    return { kind: 'sync', sha, baseSha: parents[0], upstreamSha: parents[1], title: subject }
  }
  if (parents.length > 1) {
    // Any other merge on the first-parent line is bookkeeping, never a change of its own.
    return { kind: 'merge', sha, title: subject, type: null, scopes: [], userFacing: false }
  }
  return withType({ kind: 'commit', sha, title: subject })
}

function withType(change) {
  const conventional = parseConventional(change.title)
  return { ...change, ...conventional, userFacing: isUserFacing(conventional.type) }
}

/** Feature id → short group name, in registry order. */
export function readFeatureGroups(registryText) {
  const registry = JSON.parse(registryText.replace(/^\s*\/\/.*$/gm, ''))
  return new Map(
    registry.features.map((feature) => [feature.id, feature.title.split('：')[0].trim()])
  )
}

export function loadFeatureGroups(path = 'config/fork-features.jsonc') {
  return readFeatureGroups(readFileSync(path, 'utf8'))
}

function groupOf(change, features) {
  for (const scope of change.scopes ?? []) {
    const id = SCOPE_ALIASES[scope] ?? scope
    if (features.has(id)) {
      return features.get(id)
    }
  }
  return OTHER_GROUP
}

/** User-facing changes grouped by feature, in registry order with 其他 last. */
export function groupUserFacing(changes, features) {
  const order = [...features.values(), OTHER_GROUP]
  const groups = new Map()
  for (const change of changes) {
    if (change.kind === 'sync' || !change.userFacing) {
      continue
    }
    const group = groupOf(change, features)
    groups.set(group, [...(groups.get(group) ?? []), change])
  }
  return order.filter((name) => groups.has(name)).map((name) => ({ name, items: groups.get(name) }))
}

export function engineeringChanges(changes) {
  return changes.filter((change) => change.kind !== 'sync' && !change.userFacing)
}

export function changeLine(change) {
  const label = TYPE_LABELS[change.type]
  const text = label ? `${label}：${change.summary}` : change.summary
  return `${text}${change.number ? ` (#${change.number})` : ''}`
}

function truncate(text, limit) {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

/**
 * The list installed clients show in their update prompt. Older clients drop the whole list when
 * it has more than 100 entries or a title over 300 characters, so both are bounded here.
 */
export function manifestChanges(changes, syncSummaries = []) {
  const entries = [
    ...syncSummaries.map((summary) => ({ title: syncHeadline(summary) })),
    ...changes
      .filter((change) => change.kind !== 'sync' && change.userFacing)
      .map((change) => ({
        ...(change.number ? { number: change.number } : {}),
        title: truncate(change.number ? change.title : changeLine(change), MAX_MANIFEST_TITLE)
      }))
  ]
  return entries.slice(0, MAX_MANIFEST_CHANGES)
}

export function syncHeadline(summary) {
  const tags = summary.releases.map((release) => release.tag)
  const details = [
    tags.length > 1
      ? `期间官方发布 ${tags[0]} 至 ${tags.at(-1)}`
      : tags.length
        ? `期间官方发布 ${tags[0]}`
        : '',
    summary.commitCount === null ? '' : `${summary.commitCount} 个提交`
  ].filter(Boolean)
  return `同步上游${details.length ? `（${details.join('，')}）` : ''}`
}

function renderSync(summary) {
  const lines = [
    `- ${syncHeadline(summary)}，[${summary.commitCount === null ? '上游提交' : '上游对比'}](${summary.compareUrl})`
  ]
  if (summary.releases.length) {
    lines.push(
      `- 官方发布说明：${summary.releases.map((release) => `[${release.tag}](${release.url})`).join('、')}`
    )
  }
  if (!summary.highlights.length) {
    return lines.join('\n')
  }
  // Upstream's feat commits include infrastructure work; its official notes are the readable source.
  const highlights = summary.highlights.map(
    (highlight) =>
      `- **${highlight.scope}**：${highlight.titles.join('；')}${highlight.more ? ` 等 ${highlight.titles.length + highlight.more} 项` : ''}`
  )
  return `${lines.join('\n')}\n\n${details('上游新功能提交摘录', highlights.join('\n'))}`
}

function details(summary, body) {
  return `<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`
}

/** Markdown body shared by build releases and milestone releases. */
export function renderChangeSections({ changes, features, syncSummaries = [] }) {
  const groups = groupUserFacing(changes, features)
  const sections = []
  if (groups.length) {
    sections.push(
      `## 这一版变了什么\n\n${groups
        .map(
          (group) =>
            `### ${group.name}\n\n${group.items.map((change) => `- ${changeLine(change)}`).join('\n')}`
        )
        .join('\n\n')}`
    )
  } else {
    sections.push(
      `## 这一版变了什么\n\n${syncSummaries.length ? '本次 fork 自身没有用户可见改动，见下方同步上游。' : '本次只有工程改动，没有用户可见变化。'}`
    )
  }
  if (syncSummaries.length) {
    sections.push(`## 同步上游\n\n${syncSummaries.map(renderSync).join('\n\n')}`)
  }
  const engineering = engineeringChanges(changes)
  if (engineering.length) {
    sections.push(
      details(
        `工程改动 ${engineering.length} 项（测试、文档、CI、重构等）`,
        engineering
          .map((change) => `- ${change.title}${change.number ? ` (#${change.number})` : ''}`)
          .join('\n')
      )
    )
  }
  return sections
}

export function foldedSection(summary, body) {
  return details(summary, body)
}
