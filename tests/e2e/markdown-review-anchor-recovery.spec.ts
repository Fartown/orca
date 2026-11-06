import { runProcessSync } from '@orca/process-host'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page, TestInfo } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { getActiveWorktreeContext, openMarkdownFixture } from './helpers/markdown-editor-fixture'
import { launchHeadlessPairedRuntimeHost } from './helpers/headless-paired-runtime-host'
import { launchPairedElectronClient } from './helpers/paired-electron-client'
import { waitForPairedClientWorktree } from './helpers/paired-client-host-session'
import { reserveLocalPort } from './helpers/reserve-local-port'
import { decodePairingOffer, encodePairingOffer } from '../../src/shared/pairing'
import type { Repo } from '../../src/shared/repo-types'
import type { Worktree } from '../../src/shared/worktree/types'

const SOURCE = '# Heading\n\nRemaining text\n\nMoved text\n'

async function seedNotes(page: Page, worktreeId: string) {
  return page.evaluate(async (worktreeId) => {
    const add = window.__store!.getState().addDiffComment
    const base = {
      worktreeId,
      filePath: 'anchor-review.md',
      source: 'markdown' as const,
      side: 'modified' as const
    }
    const missing = await add({
      ...base,
      lineNumber: 2,
      selectedText: 'Removed text',
      body: 'Original review body'
    })
    const moved = await add({
      ...base,
      lineNumber: 999,
      selectedText: 'Moved text',
      body: 'Moved review body'
    })
    const normal = await add({
      ...base,
      lineNumber: 3,
      selectedText: 'Remaining text',
      body: 'Unchanged review body'
    })
    if (!missing || !moved || !normal) {
      throw new Error('Failed to persist fixture notes')
    }
    return { missing, moved, normal }
  }, worktreeId)
}

async function exerciseNotes(
  page: Page,
  notes: Awaited<ReturnType<typeof seedNotes>>,
  testInfo: TestInfo
) {
  const toggle = page.locator('.rich-markdown-review-rail-toggle')
  await expect(toggle).toHaveText('3')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('[data-rich-markdown-review-note-id]')).toHaveCount(3)
  const missing = page.locator(`[data-rich-markdown-review-note-id="${notes.missing.id}"]`)
  const moved = page.locator(`[data-rich-markdown-review-note-id="${notes.moved.id}"]`)
  await expect(missing).toContainText(/Original text changed|原文已变更/)
  await expect(moved).not.toContainText(/Original text changed|原文已变更/)
  await expect(moved).toContainText('Moved review body')
  await expect
    .poll(
      () =>
        page.locator('[data-rich-markdown-review-note-id]').evaluateAll((cards) => {
          const bounds = cards
            .map((card) => card.getBoundingClientRect())
            .sort((a, b) => a.top - b.top)
          return bounds.every((rect, index) => index === 0 || rect.top >= bounds[index - 1]!.bottom)
        }),
      { timeout: 3000 }
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('recovered-review-notes.png'),
    animations: 'disabled'
  })
  await missing.getByRole('button', { name: /^(Edit note|编辑备注)$/, exact: true }).click()
  await missing.locator('textarea').fill('Edited unresolved review')
  await missing.getByRole('button', { name: /^(Save|保存)$/, exact: true }).click()
  await expect(missing.locator('.orca-diff-comment-body')).toHaveText('Edited unresolved review')
  await page.screenshot({
    path: testInfo.outputPath('edited-unresolved-review.png'),
    animations: 'disabled'
  })
}

test('local Markdown notes remain accessible after source anchors change', async ({
  orcaPage,
  electronApp
}, testInfo) => {
  const context = await getActiveWorktreeContext(orcaPage)
  const file = path.join(context.rootPath, 'anchor-review.md')
  writeFileSync(file, SOURCE)
  try {
    const notes = await seedNotes(orcaPage, context.worktreeId)
    await openMarkdownFixture(orcaPage, context, file)
    await exerciseNotes(orcaPage, notes, testInfo)
    const missing = orcaPage.locator(`[data-rich-markdown-review-note-id="${notes.missing.id}"]`)
    await missing.getByRole('button', { name: /^(Delete note|删除注释)$/, exact: true }).click()
    await expect(orcaPage.locator('[data-rich-markdown-review-note-id]')).toHaveCount(2)
    await expect(orcaPage.locator('.rich-markdown-review-rail-toggle')).toHaveText('2')
    expect(readFileSync(file, 'utf8')).toBe(SOURCE)
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((w) => w.isVisible() || w.isFocused())
      )
    ).toBe(false)
  } finally {
    rmSync(file, { force: true })
  }
})

test('remote Markdown notes persist edits and deletion on their execution host', async ({
  orcaAppExtraEnv
}, testInfo) => {
  // Two isolated Electron runtimes plus an optional authenticated SSH forward.
  test.setTimeout(240_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-markdown-anchor-'))
  const project = path.join(root, 'review-project')
  mkdirSync(project)
  writeFileSync(path.join(project, 'anchor-review.md'), SOURCE)
  const host = await launchHeadlessPairedRuntimeHost({ extraEnv: orcaAppExtraEnv })
  let client: Awaited<ReturnType<typeof launchPairedElectronClient>> | undefined
  let tunnel: { args: string[]; directory: string; target: string } | undefined
  try {
    let offer = host.offer
    const target = process.env.ORCA_E2E_MARKDOWN_SSH_TARGET
    if (target) {
      const decoded = decodePairingOffer(offer.pairingUrl)
      const endpoint = new URL(decoded.endpoint)
      const reservation = await reserveLocalPort()
      await reservation.release()
      const directory = mkdtempSync(path.join(os.tmpdir(), 'orma-'))
      const args = [
        '-S',
        path.join(directory, 'control'),
        '-p',
        process.env.ORCA_E2E_MARKDOWN_SSH_PORT ?? '22',
        '-oBatchMode=yes',
        '-oStrictHostKeyChecking=yes'
      ]
      const identity = process.env.ORCA_E2E_MARKDOWN_SSH_IDENTITY
      const knownHosts = process.env.ORCA_E2E_MARKDOWN_SSH_KNOWN_HOSTS
      if (identity) {
        args.push('-i', identity, '-oIdentitiesOnly=yes')
      }
      if (knownHosts) {
        args.push('-o', `UserKnownHostsFile=${knownHosts}`)
      }
      tunnel = { args, directory, target }
      const forward = runProcessSync({
        program: 'ssh',
        args: [
          ...args,
          '-M',
          '-fNT',
          '-oExitOnForwardFailure=yes',
          '-L',
          `127.0.0.1:${reservation.port}:${endpoint.hostname}:${endpoint.port}`,
          target
        ],
        timeoutMs: 15_000,
        maxOutputBytes: 1024 * 1024
      })
      if (forward.code !== 0) {
        throw new Error(`SSH forward failed: ${forward.stderr}`)
      }
      endpoint.hostname = '127.0.0.1'
      endpoint.port = String(reservation.port)
      offer = { pairingUrl: encodePairingOffer({ ...decoded, endpoint: endpoint.toString() }) }
    }
    await testInfo.attach('transport', {
      body: target ? 'Authenticated SSH TCP forward' : 'Loopback paired runtime',
      contentType: 'text/plain'
    })
    const added = await host.client.call<{ repo: Repo }>('repo.add', {
      path: project,
      kind: 'folder'
    })
    const listed = await host.client.call<{ worktrees: Worktree[] }>('worktree.list', {
      repo: `id:${added.result.repo.id}`
    })
    const worktree = listed.result.worktrees[0]!
    const base = {
      worktreeId: worktree.id,
      filePath: 'anchor-review.md',
      source: 'markdown' as const,
      side: 'modified' as const,
      createdAt: 1
    }
    const notes = {
      missing: {
        ...base,
        id: 'missing-anchor',
        lineNumber: 2,
        selectedText: 'Removed text',
        body: 'Original review body'
      },
      moved: {
        ...base,
        id: 'moved-anchor',
        lineNumber: 999,
        selectedText: 'Moved text',
        body: 'Moved review body'
      },
      normal: {
        ...base,
        id: 'normal-anchor',
        lineNumber: 3,
        selectedText: 'Remaining text',
        body: 'Unchanged review body'
      }
    }
    await host.client.call('worktree.set', {
      worktree: `id:${worktree.id}`,
      diffComments: Object.values(notes)
    })
    client = await launchPairedElectronClient(offer, testInfo, 'markdown-review-host')
    await waitForPairedClientWorktree(client.page, worktree.id)
    await client.page.evaluate(
      ({ id, environmentId }) =>
        window.__store!.getState().setActiveWorktree(id, `runtime:${environmentId}`),
      { id: worktree.id, environmentId: client.environmentId }
    )
    await expect(client.page.getByRole('textbox', { name: 'Terminal input' })).toBeVisible()
    await client.page.getByRole('button', { name: 'anchor-review.md', exact: true }).dblclick()
    await exerciseNotes(client.page, notes, testInfo)
    const updated = await host.client.call<{ worktree: Worktree }>('worktree.show', {
      worktree: `id:${worktree.id}`
    })
    expect(
      updated.result.worktree.diffComments?.find((note) => note.id === notes.missing.id)?.body
    ).toBe('Edited unresolved review')
    expect(
      updated.result.worktree.diffComments?.find((note) => note.id === notes.moved.id)
    ).toMatchObject(notes.moved)
    await client.page
      .locator(`[data-rich-markdown-review-note-id="${notes.missing.id}"]`)
      .getByRole('button', { name: /^(Delete note|删除注释)$/, exact: true })
      .click()
    await expect(client.page.locator('[data-rich-markdown-review-note-id]')).toHaveCount(2)
    await expect
      .poll(async () => {
        const readback = await host.client.call<{ worktree: Worktree }>('worktree.show', {
          worktree: `id:${worktree.id}`
        })
        return readback.result.worktree.diffComments?.map((note) => note.id).sort()
      })
      .toEqual([notes.moved.id, notes.normal.id].sort())
    const deleted = await host.client.call<{ worktree: Worktree }>('worktree.show', {
      worktree: `id:${worktree.id}`
    })
    expect(readFileSync(path.join(project, 'anchor-review.md'), 'utf8')).toBe(SOURCE)
    expect(
      await client.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((w) => w.isVisible() || w.isFocused())
      )
    ).toBe(false)
    await testInfo.attach('host-readback', {
      body: JSON.stringify(deleted.result.worktree.diffComments),
      contentType: 'application/json'
    })
  } finally {
    await client?.dispose()
    if (tunnel) {
      const closed = runProcessSync({
        program: 'ssh',
        args: [...tunnel.args, '-O', 'exit', tunnel.target],
        timeoutMs: 5_000,
        maxOutputBytes: 1024 * 1024
      })
      rmSync(tunnel.directory, { recursive: true, force: true })
      expect(closed.code).toBe(0)
    }
    await host.dispose()
    rmSync(root, { recursive: true, force: true })
  }
})
