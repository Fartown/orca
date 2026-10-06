// Optional Chinese short version for a milestone page, written by Claude in a job without write access.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { commandOutput } from './command-output.mjs'
import { listReleases } from './integration-releases.mjs'
import { releaseContext } from './release-context.mjs'
import { changeLine, groupUserFacing, loadFeatureGroups, syncHeadline } from './release-notes.mjs'

export const AI_SUMMARY_MODEL = 'claude-opus-5-5'
export const AI_SUMMARY_FILE = 'ai-summary.md'
const MAX_PR_BODIES = 30
const MAX_PR_SECTION = 1200
const MAX_UPSTREAM_SHORT_VERSION = 4000
const MAX_UPSTREAM_RELEASES = 3
const PR_SECTIONS = ['ELI5', 'What Changed']

const SYSTEM_PROMPT = `你为 Orca 的 fork 集成版写发布页最上方的「短版本」。读者是日常使用 Orca 的人，不读代码。
只写这一版对使用者有什么变化：新增了什么、修好了什么、哪里更快更稳；同步上游带来的重要变化也要写。
- 简体中文，4 到 8 条 Markdown 列表项，每条一两句话，以「- 」开头；可以用 **加粗** 开头点明主题。不要标题、前言或结尾。
- 写使用者能感知的效果，不写实现细节、文件名、函数名、提交号或 PR 号。
- 只依据给出的材料，不推测材料里没有的功能。
- 测试、CI、重构、文档类改动不写，除非它改变了使用体验。`

function truncate(text, limit) {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

/** The plain-language sections of a pull request body, without template comments. */
export function prSummarySections(body) {
  const sections = new Map()
  let current = null
  for (const line of (body ?? '').replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      current = PR_SECTIONS.includes(heading[1]) ? heading[1] : null
      continue
    }
    if (current) {
      sections.set(current, `${sections.get(current) ?? ''}${line}\n`)
    }
  }
  return PR_SECTIONS.flatMap((name) => {
    const text = sections.get(name)?.trim()
    return text ? [`${name}: ${truncate(text, MAX_PR_SECTION)}`] : []
  }).join('\n')
}

/** The "The short version" section of an official upstream release. */
export function upstreamShortVersion(body) {
  const match = (body ?? '').match(
    /^## The short version\s*$([\s\S]*?)(?=^## |^---\s*$|(?![\s\S]))/m
  )
  return match ? truncate(match[1].trim(), MAX_UPSTREAM_SHORT_VERSION) : ''
}

export function summaryPrompt({ changes, features, prBodies, syncSummaries }) {
  const fork = groupUserFacing(changes, features).map(
    (group) =>
      `### ${group.name}\n${group.items
        .map((change) => {
          const details = change.number ? prSummarySections(prBodies.get(change.number)) : ''
          return `- ${changeLine(change)}${details ? `\n${details.replace(/^/gm, '  ')}` : ''}`
        })
        .join('\n')}`
  )
  const upstream = syncSummaries.map((summary) => {
    const releases = summary.releases.slice(-MAX_UPSTREAM_RELEASES).flatMap((release) => {
      const short = upstreamShortVersion(release.body)
      return short ? [`官方 ${release.tag} 的短版本：\n${short}`] : []
    })
    const highlights = summary.highlights.map(
      (highlight) => `- ${highlight.scope}：${highlight.titles.join('；')}`
    )
    return [
      syncHeadline(summary),
      ...releases,
      ...(highlights.length ? ['上游新功能提交：', ...highlights] : [])
    ].join('\n')
  })
  return [
    `<fork_changes>\n${fork.join('\n\n') || '（本次 fork 自身没有用户可见改动）'}\n</fork_changes>`,
    `<upstream_sync>\n${upstream.join('\n\n') || '（本次没有同步上游）'}\n</upstream_sync>`,
    '按要求写这一版的短版本。'
  ].join('\n\n')
}

const BULLET = /^- \S/

/** Claude's short version, or null when there is no key, no SDK, an error or a refusal. */
export async function writeAiSummary({ apiKey, prompt, createClient }) {
  if (!apiKey) {
    console.log('ANTHROPIC_API_KEY is not set; the milestone has no AI short version.')
    return null
  }
  try {
    const client = createClient
      ? createClient()
      : new (await import('@anthropic-ai/sdk')).default({ apiKey, timeout: 300_000 })
    const response = await client.beta.messages
      .stream({
        model: AI_SUMMARY_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      })
      .finalMessage()
    if (response.stop_reason !== 'end_turn') {
      console.warn(`AI short version skipped: stopped with ${response.stop_reason}.`)
      return null
    }
    const lines = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim())
    if (lines.length < 2 || lines.length > 12 || !lines.every((line) => BULLET.test(line))) {
      console.warn('AI short version skipped: the reply was not a short bullet list.')
      return null
    }
    return lines.join('\n')
  } catch (error) {
    console.warn(
      `AI short version skipped: ${error?.status ?? ''} ${error?.message ?? error}`.trim()
    )
    return null
  }
}

function pullRequestBodies(gh, repo, changes) {
  const bodies = new Map()
  for (const change of changes.filter((item) => item.number).slice(0, MAX_PR_BODIES)) {
    try {
      bodies.set(
        change.number,
        gh(['api', `repos/${repo}/pulls/${change.number}`, '--jq', '.body'])
      )
    } catch (error) {
      console.warn(`Could not read #${change.number}: ${error.message}`)
    }
  }
  return bodies
}

/** Writes `ai-summary.md` into `directory` when this build gets a milestone; never fails the run. */
export async function writeMilestoneSummary({ env, directory, gh, git, createClient }) {
  mkdirSync(directory, { recursive: true })
  try {
    const repo = env.GITHUB_REPOSITORY
    const context = releaseContext({
      gh,
      git,
      releases: listReleases(gh, repo),
      sha: env.GITHUB_SHA,
      runId: env.GITHUB_RUN_ID,
      milestoneRequested: env.ORCA_INTEGRATION_MILESTONE === 'true'
    })
    if (!context.plan) {
      console.log('This build does not get a milestone release.')
      return null
    }
    const changes = context.plan.changes.filter((change) => change.userFacing)
    const summary = await writeAiSummary({
      apiKey: env.ANTHROPIC_API_KEY,
      createClient,
      prompt: summaryPrompt({
        changes: context.plan.changes,
        features: loadFeatureGroups(),
        prBodies: pullRequestBodies(gh, repo, changes),
        syncSummaries: context.syncSummariesOf(context.plan.changes)
      })
    })
    if (summary) {
      writeFileSync(join(directory, AI_SUMMARY_FILE), `${summary}\n`)
    }
    return summary
  } catch (error) {
    console.warn(`AI short version skipped: ${error.message}`)
    return null
  }
}

/** The short version the summary job left for this run, if any. */
export function readAiSummary(directory) {
  if (!directory) {
    return null
  }
  try {
    return readFileSync(join(directory, AI_SUMMARY_FILE), 'utf8').trim() || null
  } catch {
    return null
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await writeMilestoneSummary({
    env: process.env,
    directory: resolve(process.argv[2]),
    gh: commandOutput('gh'),
    git: commandOutput('git')
  })
}
