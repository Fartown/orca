import { describe, expect, it } from 'vitest'
import { checkPullRequestLinkedIssue, findLinkedIssueNumbers } from './pr-linked-issue.mjs'

const REPO = 'Fartown/orca'
const ISSUES = new Map([
  [84, { number: 84, title: '分享页评论' }],
  [83, { number: 83, title: 'a PR', pull_request: { url: 'x' } }]
])
const fetchIssue = async (number) => ISSUES.get(number) ?? null

function check(body, ref = 'claude/share-comments') {
  return checkPullRequestLinkedIssue({
    pullRequest: { body, head: { ref } },
    repository: REPO,
    fetchIssue
  })
}

describe('fork PRs link the issue they resolve', () => {
  it('reads closing keywords with #n, owner/repo#n and issue URLs, but not the template placeholder', () => {
    const body = [
      '<!-- Fixes #1 inside a comment does not count -->',
      'Fixes #',
      'Fixes #84, closes Fartown/orca#85',
      'Resolves: https://github.com/Fartown/orca/issues/86',
      'Fixes stablyai/orca#99',
      'Refs #87'
    ].join('\n')
    expect(findLinkedIssueNumbers(body, REPO)).toEqual([84, 85, 86])
  })

  it('passes only when a linked number is an existing issue', async () => {
    await expect(check('Fixes #84')).resolves.toMatchObject({ ok: true })
    await expect(check('## Linked Issue\n\nFixes #\n')).resolves.toMatchObject({ ok: false })
    await expect(check('Fixes #83')).resolves.toMatchObject({
      ok: false,
      message: '#83 is a pull request; link the issue it resolves.'
    })
    await expect(check('Fixes #4040')).resolves.toMatchObject({ ok: false })
    await expect(check('Fixes #4040\nFixes #84')).resolves.toMatchObject({ ok: true })
  })

  it('lets the weekly upstream sync through without an issue', async () => {
    await expect(check('', 'sync/upstream-2026-11-09')).resolves.toMatchObject({ ok: true })
  })
})
