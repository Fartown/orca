#!/usr/bin/env node
// Docs gate for fork features. The feature registry says what exists; the task-leader
// documents under docs/issue/<feature>/ say why it exists and how far it is. This keeps
// the two from drifting: journal status vocabulary and sections, the key-document table,
// REQ ids and their states, "已实现" REQs being covered by a test-case document, and the
// docs/issue/README.md index being generated rather than hand-edited.
//
// Usage: node config/scripts/check-fork-docs.mjs [--write-index]
// See docs/reference/fork-maintenance.md.
import fs from 'node:fs'
import path from 'node:path'
import { loadForkFeatureRegistry } from './check-fork-features.mjs'

export const ISSUE_INDEX_PATH = 'docs/issue/README.md'
export const JOURNAL_STATUSES = [
  'clarifying',
  'designing',
  'implementing',
  'testing',
  'done',
  'blocked'
]
export const DOCUMENT_STATUSES = [
  'pending-decision',
  'draft',
  'ready',
  'reviewing',
  'approved',
  'needs-update',
  'not-required',
  'superseded',
  'completed'
]
const JOURNAL_SECTIONS = ['## 1. 关键文档链接', '## 2. 决策点记录', '## 3. 开发记录']
const RECORD_BULLETS = ['- 本轮目标', '- 验证证据']
const DATE = /^\d{4}-\d{2}-\d{2}$/
const REQ_HEADING = /^### (REQ-\d+)\b/
const LINK = /\[[^\]]*\]\(([^)]+)\)/g

export function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) {
    return { fields: null, body: text }
  }
  const fields = {}
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':')
    if (separator > 0) {
      fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
    }
  }
  return { fields, body: text.slice(match[0].length) }
}

/** Rows of the first Markdown table after `heading`, as arrays of trimmed cells. */
export function tableRowsAfter(text, heading) {
  const start = text.indexOf(heading)
  if (start === -1) {
    return []
  }
  const lines = text.slice(start).split('\n').slice(1)
  const rows = []
  let inTable = false
  for (const line of lines) {
    if (line.startsWith('|')) {
      inTable = true
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim())
      if (cells.every((cell) => /^-+$/.test(cell))) {
        continue
      }
      rows.push(cells)
    } else if (inTable) {
      break
    }
  }
  return rows.slice(1) // drop the header row
}

function markdownFilesIn(io, dir) {
  return io
    .list(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => path.posix.join(dir, name))
}

/**
 * Pure evaluation over an `io` seam ({ exists, read, list }) so tests run on a temp tree.
 * @returns {{ file: string, message: string }[]}
 */
export function evaluateForkDocs({ registry, io }) {
  const violations = []
  const report = (file, message) => violations.push({ file, message })

  for (const feature of registry.features) {
    const journalPath = feature.journal
    const dir = path.posix.dirname(journalPath)
    if (!io.exists(journalPath)) {
      report(journalPath, `Feature ${feature.id}: journal is missing.`)
      continue
    }
    const journal = io.read(journalPath)
    const { fields, body } = parseFrontmatter(journal)
    if (!fields) {
      report(journalPath, 'journal has no frontmatter (title/status/created/updated).')
    } else {
      if (!JOURNAL_STATUSES.includes(fields.status)) {
        report(
          journalPath,
          `journal status "${fields.status ?? ''}" is not one of ${JOURNAL_STATUSES.join('/')}.`
        )
      }
      for (const key of ['created', 'updated']) {
        if (!DATE.test(fields[key] ?? '')) {
          report(journalPath, `journal frontmatter ${key} must be YYYY-MM-DD.`)
        }
      }
      if (
        DATE.test(fields.created ?? '') &&
        DATE.test(fields.updated ?? '') &&
        fields.updated < fields.created
      ) {
        report(journalPath, 'journal updated date is earlier than created.')
      }
      if (!fields.title) {
        report(journalPath, 'journal frontmatter needs a title.')
      }
    }
    let cursor = -1
    for (const section of JOURNAL_SECTIONS) {
      const index = body.indexOf(section)
      if (index === -1 || index < cursor) {
        report(journalPath, `journal must contain "${section}" in order.`)
      } else {
        cursor = index
      }
    }
    for (const row of tableRowsAfter(body, JOURNAL_SECTIONS[0])) {
      const [kind, doc = '', status = ''] = row
      if (!DOCUMENT_STATUSES.includes(status)) {
        report(
          journalPath,
          `key document "${kind}" has status "${status}", not one of ${DOCUMENT_STATUSES.join('/')}.`
        )
      }
      for (const match of doc.matchAll(LINK)) {
        const target = path.posix.normalize(path.posix.join(dir, match[1].split('#')[0]))
        if (!io.exists(target)) {
          report(journalPath, `key document "${kind}" links to a missing file: ${match[1]}`)
        }
      }
    }
    const records = body.split(JOURNAL_SECTIONS[2])[1] ?? ''
    const entries = records.split(/^### /m).slice(1)
    if (entries.length === 0) {
      report(journalPath, 'journal has no development record under "## 3. 开发记录".')
    }
    for (const entry of entries) {
      const title = entry.split('\n')[0].trim()
      for (const bullet of RECORD_BULLETS) {
        if (!entry.includes(bullet)) {
          report(journalPath, `development record "${title}" lacks "${bullet}".`)
        }
      }
    }

    const requirementFiles = io.exists(`${dir}/requirements`)
      ? markdownFilesIn(io, `${dir}/requirements`)
      : []
    if (requirementFiles.length === 0) {
      report(`${dir}/requirements`, `Feature ${feature.id}: no requirements document.`)
    }
    const seen = new Map()
    const implemented = new Set()
    for (const file of requirementFiles) {
      const lines = io.read(file).split('\n')
      for (let index = 0; index < lines.length; index += 1) {
        const heading = lines[index].match(REQ_HEADING)
        if (!heading) {
          continue
        }
        const id = heading[1]
        if (seen.has(id)) {
          report(file, `${id} is declared twice (also in ${seen.get(id)}).`)
        }
        seen.set(id, file)
        let end = index + 1
        while (end < lines.length && !lines[end].startsWith('##')) {
          end += 1
        }
        const block = lines.slice(index + 1, end).join('\n')
        const state = block.match(/当前状态[：:]\s*([^\n]*)/)
        if (!state) {
          report(file, `${id} has no "当前状态：" line.`)
        } else if (state[1].startsWith('已实现')) {
          implemented.add(id)
        }
      }
    }
    if (seen.size === 0 && requirementFiles.length > 0) {
      report(requirementFiles[0], `Feature ${feature.id}: no "### REQ-<n>" headings found.`)
    }
    const caseFiles = io.exists(`${dir}/tests/cases`)
      ? markdownFilesIn(io, `${dir}/tests/cases`)
      : []
    const caseText = caseFiles.map((file) => io.read(file)).join('\n')
    for (const id of implemented) {
      if (!new RegExp(`\\b${id}\\b`).test(caseText)) {
        report(
          caseFiles[0] ?? `${dir}/tests/cases`,
          `${id} is marked 已实现 but no test-case document under tests/cases references it.`
        )
      }
    }
  }

  const expected = renderIssueIndex({ registry, io })
  if (!io.exists(ISSUE_INDEX_PATH)) {
    report(ISSUE_INDEX_PATH, 'index is missing; run pnpm generate:issue-index.')
  } else if (normalize(io.read(ISSUE_INDEX_PATH)) !== normalize(expected)) {
    report(ISSUE_INDEX_PATH, 'index is out of date; run pnpm generate:issue-index.')
  }
  return violations
}

/** Whitespace-insensitive comparison so oxfmt's table padding never fails the gate. */
function normalize(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/-{3,}/g, '---').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function links(io, dir, subdir, base) {
  if (!io.exists(`${dir}/${subdir}`)) {
    return '-'
  }
  const files = markdownFilesIn(io, `${dir}/${subdir}`)
  if (files.length === 0) {
    return '-'
  }
  return files
    .map((file) => `[${path.posix.basename(file, '.md')}](${path.posix.relative(base, file)})`)
    .join('、')
}

export function renderIssueIndex({ registry, io }) {
  const base = path.posix.dirname(ISSUE_INDEX_PATH)
  const rows = registry.features.map((feature) => {
    const dir = path.posix.dirname(feature.journal)
    const journal = io.exists(feature.journal)
      ? parseFrontmatter(io.read(feature.journal)).fields
      : null
    const name = journal?.title ?? feature.id
    return [
      `[${name}](${path.posix.relative(base, feature.journal)})`,
      feature.goal ?? feature.title,
      journal?.status ?? '-',
      links(io, dir, 'requirements', base),
      links(io, dir, 'solutions', base),
      links(io, dir, 'tests/cases', base),
      journal?.updated ?? '-'
    ]
  })
  const header = ['需求', '目标', '状态', '需求文档', '方案', '测试用例', '更新']
  const table = [header, header.map(() => '---'), ...rows]
    .map((cells) => `| ${cells.join(' | ')} |`)
    .join('\n')
  return `# 本地新增需求索引

本索引由 \`pnpm generate:issue-index\` 从 \`config/fork-features.jsonc\` 和各需求的 \`journal.md\` 生成，不要手改；\`pnpm check:fork-docs\` 会核对它与事实源一致。每个 Journal 是本需求的文档入口；目标及 P0/P1/P2 在各自需求正文中维护，技术与测试不跨需求合并。

${table}

状态是需求整体状态（clarifying / designing / implementing / testing / done / blocked）；各文档自己的状态以 Journal 的关键文档链接表为准。文档 ready、代码存在、单测通过和真实产品验收是不同状态；各自 Test Run 只证明记录的执行范围。

此处仅整理本地需求，不收拢上游 docs/site、通用架构等文档。跨需求的迁移、恢复及文档校验证据放在 [维护记录](../maintenance/本地需求文档整理/2026-09-05-文档归并记录.md)，不另立为产品需求。
`
}

export function nodeIo(root) {
  return {
    exists: (file) => fs.existsSync(path.join(root, file)),
    read: (file) => fs.readFileSync(path.join(root, file), 'utf8'),
    list: (dir) => fs.readdirSync(path.join(root, dir))
  }
}

export function main(argv = process.argv.slice(2)) {
  const root = path.resolve(import.meta.dirname, '..', '..')
  const registry = loadForkFeatureRegistry(root)
  const io = nodeIo(root)
  if (argv.includes('--write-index')) {
    fs.writeFileSync(path.join(root, ISSUE_INDEX_PATH), renderIssueIndex({ registry, io }))
    console.log(`Wrote ${ISSUE_INDEX_PATH}.`)
    return 0
  }
  const violations = evaluateForkDocs({ registry, io })
  if (violations.length === 0) {
    console.log(
      `Fork docs gate passed: ${registry.features.map((feature) => feature.id).join(', ')}.`
    )
    return 0
  }
  for (const violation of violations) {
    console.error(`${violation.file}: ${violation.message}`)
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.error(`::error file=${violation.file}::${violation.message.replace(/\n/g, ' ')}`)
    }
  }
  console.error(`Fork docs gate failed with ${violations.length} violation(s).`)
  return 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = main()
}
