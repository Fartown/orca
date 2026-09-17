#!/usr/bin/env node
/**
 * Bundles the page script local network share links load to render Markdown.
 *
 * Same shape as build-goal-driver.mjs: a self-contained bundle resolved from out/ in dev and
 * from extraResources when packaged. The Orca app serves these files; readers never need Orca.
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const RENDERER_SRC = join(ROOT, 'src', 'renderer', 'src')
const VIEWER_DIR = join(RENDERER_SRC, 'components', 'self-hosted-artifacts', 'share-viewer')
const OUT_DIR =
  process.env.ORCA_ARTIFACT_SHARE_VIEWER_OUT_DIR ?? join(ROOT, 'out', 'artifact-share-viewer')
const TOKENS_MODULE = 'orca-share-viewer-tokens.css'

/** Copies the light and dark token blocks verbatim so the page uses the app's canonical colors. */
export function extractThemeTokenBlocks(mainCss) {
  const blocks = []
  for (const selector of [':root', '.dark']) {
    const start = mainCss.search(new RegExp(`^${selector.replace('.', '\\.')} \\{`, 'm'))
    if (start === -1) {
      throw new Error(`main.css no longer defines a top-level ${selector} token block`)
    }
    const end = mainCss.indexOf('\n}', start)
    blocks.push(mainCss.slice(start, end + 2))
  }
  return blocks.join('\n\n')
}

const viewerResolvePlugin = {
  name: 'orca-share-viewer-resolve',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^@\/i18n\/i18n$/ }, () => ({
      path: join(VIEWER_DIR, 'viewer-i18n-shim.ts')
    }))
    pluginBuild.onResolve({ filter: /^@\// }, (args) =>
      pluginBuild.resolve(`./${args.path.slice(2)}`, { resolveDir: RENDERER_SRC, kind: args.kind })
    )
    pluginBuild.onResolve(
      { filter: new RegExp(`^${TOKENS_MODULE.replace(/\./g, '\\.')}$`) },
      () => ({
        path: TOKENS_MODULE,
        namespace: 'orca-share-viewer-tokens'
      })
    )
    pluginBuild.onLoad({ filter: /.*/, namespace: 'orca-share-viewer-tokens' }, () => ({
      contents: extractThemeTokenBlocks(
        readFileSync(join(RENDERER_SRC, 'assets', 'main.css'), 'utf8')
      ),
      loader: 'css'
    }))
  }
}

export async function buildArtifactShareViewer(outDir = OUT_DIR) {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  const result = await build({
    entryPoints: [join(VIEWER_DIR, 'viewer-entry.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    outdir: outDir,
    entryNames: 'viewer.[hash]',
    assetNames: '[name].[hash]',
    loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' },
    define: { 'process.env.NODE_ENV': '"production"' },
    metafile: true,
    logLevel: 'warning',
    plugins: [viewerResolvePlugin]
  })
  const outputs = Object.keys(result.metafile.outputs).map((output) => basename(output))
  const script = outputs.find((name) => /^viewer\.[^.]+\.js$/.test(name))
  const style = outputs.find((name) => /^viewer\.[^.]+\.css$/.test(name))
  if (!script || !style) {
    throw new Error(`Share viewer build produced no script or stylesheet: ${outputs.join(', ')}`)
  }
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify({ script, style }, null, 2)}\n`)
  return { script, style }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { script, style } = await buildArtifactShareViewer()
  console.log(`[artifact-share-viewer] wrote ${script} and ${style} to ${OUT_DIR}`)
}
