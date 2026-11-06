import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildArtifactShareViewer } from './build-artifact-share-viewer.mjs'

const directories = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function buildInto(options) {
  const directory = mkdtempSync(join(tmpdir(), 'artifact-share-viewer-'))
  directories.push(directory)
  return buildArtifactShareViewer(directory, options).then((manifest) => ({ directory, manifest }))
}

describe('artifact share viewer build', () => {
  it('styles the page with the app stylesheet compiled for the components it renders', async () => {
    const { directory, manifest } = await buildInto({ portable: false })
    const css = readFileSync(join(directory, manifest.style), 'utf8')

    // The TOC panel and callouts are app components; their utilities exist only if the graph was scanned.
    expect(css).toContain('.markdown-toc-panel')
    expect(css).toContain('.border-callout-note')
    expect(css).toContain('--editor-surface')
    expect(readdirSync(directory).some((name) => /^Geist-Variable\..+\.woff2$/.test(name))).toBe(
      true
    )
  }, 120_000)

  it('ships exactly the files the SSH host deploy lists, with fonts inline', async () => {
    const { directory } = await buildInto({ portable: true })

    expect(readdirSync(directory).sort()).toEqual([
      'manifest.json',
      'viewer.orcad.css',
      'viewer.orcad.js'
    ])
  }, 120_000)
})
