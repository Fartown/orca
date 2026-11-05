#!/usr/bin/env node
/**
 * Every fork change starts as a GitHub issue and its PR links it with a closing keyword
 * (docs/reference/fork-maintenance.md, daily rule 9). Runs in fork-pr-linked-issue.yml.
 */
import { readFileSync } from 'node:fs'

const KEYWORD = String.raw`(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)`
const REFERENCE = String.raw`(?:(?<owner>[\w.-]+)\/(?<repo>[\w.-]+))?#(?<number>\d+)`
const URL_REFERENCE = String.raw`https:\/\/github\.com\/(?<urlOwner>[\w.-]+)\/(?<urlRepo>[\w.-]+)\/issues\/(?<urlNumber>\d+)`
const LINK = new RegExp(String.raw`\b${KEYWORD}\s*:?\s+(?:${URL_REFERENCE}|${REFERENCE})\b`, 'gi')

/** Issue numbers in this repository that the PR body closes; the template's bare `Fixes #` is none. */
export function findLinkedIssueNumbers(body, repository) {
  const text = (body ?? '').replace(/<!--[\s\S]*?-->/g, '')
  const numbers = new Set()
  for (const match of text.matchAll(LINK)) {
    const groups = match.groups ?? {}
    const owner = groups.urlOwner ?? groups.owner
    const repo = groups.urlRepo ?? groups.repo
    if (owner && `${owner}/${repo}`.toLowerCase() !== repository.toLowerCase()) {
      continue
    }
    numbers.add(Number(groups.urlNumber ?? groups.number))
  }
  return [...numbers]
}

/**
 * `fetchIssue(number)` resolves to the issues API object or null when it does not exist. The
 * issues API also answers for pull requests, which carry a `pull_request` field.
 */
export async function checkPullRequestLinkedIssue({ pullRequest, repository, fetchIssue }) {
  if (pullRequest.head?.ref?.startsWith('sync/upstream-')) {
    return { ok: true, message: 'Upstream sync PRs are opened by the weekly workflow.' }
  }
  const numbers = findLinkedIssueNumbers(pullRequest.body, repository)
  if (numbers.length === 0) {
    return {
      ok: false,
      message:
        'Link the GitHub issue this PR resolves: open one first, then put `Fixes #<issue>` in the description.'
    }
  }
  const problems = []
  for (const number of numbers) {
    const issue = await fetchIssue(number)
    if (!issue) {
      problems.push(`#${number} does not exist in ${repository}.`)
    } else if (issue.pull_request) {
      problems.push(`#${number} is a pull request; link the issue it resolves.`)
    } else {
      return { ok: true, message: `Linked issue #${number}: ${issue.title}` }
    }
  }
  return { ok: false, message: problems.join('\n') }
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const repository = process.env.GITHUB_REPOSITORY
  const api = process.env.GITHUB_API_URL ?? 'https://api.github.com'
  const fetchIssue = async (number) => {
    const response = await fetch(`${api}/repos/${repository}/issues/${number}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
      }
    })
    if (response.status === 404 || response.status === 410) {
      return null
    }
    if (!response.ok) {
      throw new Error(`GitHub answered ${response.status} for #${number}`)
    }
    return response.json()
  }
  const result = await checkPullRequestLinkedIssue({
    pullRequest: event.pull_request,
    repository,
    fetchIssue
  })
  console.log(result.message)
  if (!result.ok) {
    console.log(`::error title=Linked issue required::${result.message.replace(/\n/g, '%0A')}`)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
