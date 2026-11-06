#!/usr/bin/env node
/**
 * Bundles the page script local network share links load to render Markdown.
 *
 * Same shape as build-goal-driver.mjs: a self-contained bundle resolved from out/ in dev and
 * from extraResources when packaged. The Orca app serves these files; readers never need Orca.
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { compile } from 'tailwindcss'

const ROOT = join(import.meta.dirname, '..', '..')
const RENDERER_SRC = join(ROOT, 'src', 'renderer', 'src')
const ASSETS_DIR = join(RENDERER_SRC, 'assets')
const VIEWER_DIR = join(RENDERER_SRC, 'components', 'self-hosted-artifacts', 'share-viewer')
const OUT_DIR =
  process.env.ORCA_ARTIFACT_SHARE_VIEWER_OUT_DIR ?? join(ROOT, 'out', 'artifact-share-viewer')
const APP_STYLES_MODULE = 'orca-share-viewer-app-styles.css'
const require = createRequire(import.meta.url)

/** How the page uses each sheet main.css imports; a new import fails the build until classified. */
const MAIN_CSS_IMPORT_ROLES = {
  tailwindcss: 'tailwind',
  './text-shimmer.css': 'tailwind',
  'katex/dist/katex.min.css': 'plain',
  './markdown-preview.css': 'plain',
  '../../../shared/styles/scrollbar-sleek.css': 'plain',
  'tw-animate-css': 'skip',
  '@xterm/xterm/css/xterm.css': 'skip',
  './rich-markdown-editor.css': 'plain',
  './terminal.css': 'skip',
  './mobile-page.css': 'skip'
}

// Why: the browser fetches this 1 MB symbol font only for Nerd Font glyphs; never inline it.
const LAZY_FONT_PATTERN = /SymbolsNerdFontMono-Regular\.woff2$/

/**
 * App modules the page reuses import a few app-only modules; each is swapped for a stand-in that
 * carries just what those importers use. Any other importer fails the build instead of shipping a
 * stand-in it was never checked against.
 */
const VIEWER_STAND_INS = [
  {
    specifier: '@/store',
    file: 'viewer-store-shim.ts',
    importers: [
      'components/editor/MarkdownTableOfContentsPanel.tsx',
      'components/editor/use-mermaid-diagram-expand.ts',
      'components/editor/DiagramViewerModal.tsx',
      'components/editor/PanZoomImageDialog.tsx',
      'components/self-hosted-artifacts/share-viewer/ShareViewerPage.tsx'
    ]
  },
  {
    specifier: '@/lib/floating-workspace-terminal-actions',
    file: 'viewer-floating-panel-shim.ts',
    importers: ['components/editor/viewer-zoom-request.ts']
  },
  {
    specifier: '@/lib/app-http-link-open',
    file: 'viewer-app-link-shim.ts',
    importers: ['components/diff-comments/DiffCommentCard.tsx']
  }
]

/** Plain sheets stay esbuild imports so their url() fonts resolve from their own directories. */
function splitMainCssImports(mainCss) {
  const plainImports = []
  const tailwindCss = mainCss.replace(/^@import '([^']+)';\r?\n/gm, (statement, specifier) => {
    const role = MAIN_CSS_IMPORT_ROLES[specifier]
    if (!role) {
      throw new Error(`main.css imports '${specifier}'; classify it in MAIN_CSS_IMPORT_ROLES`)
    }
    if (role === 'plain') {
      plainImports.push(specifier)
    }
    return role === 'tailwind' ? statement : ''
  })
  return { tailwindCss, plainImports }
}

const LOCALES_DIR = join(RENDERER_SRC, 'i18n', 'locales')
const TRANSLATE_KEY = /\btranslate\(\s*['"]([^'"]+)['"]/g

function lookupMessage(catalog, key) {
  const nested = key.split('.').reduce((node, part) => node?.[part], catalog)
  return typeof nested === 'string'
    ? nested
    : typeof catalog[key] === 'string'
      ? catalog[key]
      : null
}

/** Per language, the catalog entries for the keys the page's modules translate; English stays inline. */
function collectViewerMessages(sources) {
  const keys = new Set()
  for (const source of sources) {
    for (const match of source.matchAll(TRANSLATE_KEY)) {
      keys.add(match[1])
    }
  }
  const messages = {}
  for (const file of readdirSync(LOCALES_DIR).filter((name) => name.endsWith('.json'))) {
    const language = file.slice(0, -'.json'.length)
    if (language === 'en') {
      continue
    }
    const catalog = JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'))
    const entries = [...keys].flatMap((key) => {
      const value = lookupMessage(catalog, key)
      return value === null ? [] : [[key, value]]
    })
    messages[language] = Object.fromEntries(entries)
  }
  return messages
}

/** Over-collects on purpose: Tailwind drops tokens that are not utilities. */
function collectClassCandidates(sources) {
  const candidates = new Set()
  for (const source of sources) {
    for (const token of source.split(/[\s'"`{};,]+/)) {
      if (token) {
        candidates.add(token)
      }
    }
  }
  return candidates
}

async function loadStylesheet(id, base) {
  const path = id === 'tailwindcss' ? require.resolve('tailwindcss/index.css') : resolve(base, id)
  return { path, base: dirname(path), content: readFileSync(path, 'utf8') }
}

/** The app's own stylesheet, with utilities generated only for classes the page's modules use. */
async function compileAppStyles(sourceFiles) {
  const { tailwindCss, plainImports } = splitMainCssImports(
    readFileSync(join(ASSETS_DIR, 'main.css'), 'utf8')
  )
  const compiler = await compile(tailwindCss, {
    base: ASSETS_DIR,
    loadStylesheet,
    loadModule: async (id) => {
      throw new Error(`main.css loads module '${id}', which the share page build does not support`)
    }
  })
  const candidates = collectClassCandidates(sourceFiles.map((file) => readFileSync(file, 'utf8')))
  return [
    ...plainImports.map((specifier) => `@import '${specifier}';`),
    compiler.build([...candidates])
  ].join('\n')
}

function viewerResolvePlugin(appStyles) {
  return {
    name: 'orca-share-viewer-resolve',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^@\/i18n\/i18n$/ }, () => ({
        path: join(VIEWER_DIR, 'viewer-i18n-shim.ts')
      }))
      for (const standIn of VIEWER_STAND_INS) {
        const filter = new RegExp(`^${standIn.specifier.replace(/[/.]/g, '\\$&')}$`)
        pluginBuild.onResolve({ filter }, (args) => {
          const importer = args.importer.split('\\').join('/')
          if (!standIn.importers.some((allowed) => importer.endsWith(allowed))) {
            throw new Error(
              `${args.importer} needs ${standIn.specifier}, which the share page does not ship`
            )
          }
          return { path: join(VIEWER_DIR, standIn.file) }
        })
      }
      pluginBuild.onResolve({ filter: /^@\// }, (args) =>
        pluginBuild.resolve(`./${args.path.slice(2)}`, {
          resolveDir: RENDERER_SRC,
          kind: args.kind
        })
      )
      pluginBuild.onResolve({ filter: LAZY_FONT_PATTERN }, (args) => ({
        path: args.path,
        external: true
      }))
      pluginBuild.onResolve(
        { filter: new RegExp(`^${APP_STYLES_MODULE.replace(/\./g, '\\.')}$`) },
        () => ({ path: APP_STYLES_MODULE, namespace: 'orca-share-viewer-app-styles' })
      )
      pluginBuild.onLoad({ filter: /.*/, namespace: 'orca-share-viewer-app-styles' }, async () => ({
        contents: await appStyles(),
        loader: 'css',
        resolveDir: ASSETS_DIR
      }))
    }
  }
}

function viewerBuildOptions(outDir, portable, appStyles, messages = {}) {
  return {
    absWorkingDir: ROOT,
    entryPoints: [join(VIEWER_DIR, 'viewer-entry.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    outdir: outDir,
    entryNames: portable ? 'viewer.orcad' : 'viewer.[hash]',
    assetNames: '[name].[hash]',
    loader: {
      '.woff': portable ? 'dataurl' : 'file',
      '.woff2': portable ? 'dataurl' : 'file',
      '.ttf': portable ? 'dataurl' : 'file'
    },
    define: {
      'process.env.NODE_ENV': '"production"',
      __ORCA_SHARE_VIEWER_MESSAGES__: JSON.stringify(messages)
    },
    metafile: true,
    logLevel: 'warning',
    plugins: [viewerResolvePlugin(appStyles)]
  }
}

/** First pass: the page's module graph, so utilities cover exactly the components it renders. */
async function collectViewerSourceFiles(outDir, portable) {
  const result = await build({
    ...viewerBuildOptions(outDir, portable, async () => ''),
    write: false
  })
  return Object.keys(result.metafile.inputs)
    .filter((input) => /\.[cm]?[jt]sx?$/.test(input) && !input.includes('node_modules'))
    .map((input) => resolve(ROOT, input))
}

export async function buildArtifactShareViewer(outDir = OUT_DIR, { portable = false } = {}) {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  const sourceFiles = await collectViewerSourceFiles(outDir, portable)
  const result = await build(
    viewerBuildOptions(
      outDir,
      portable,
      () => compileAppStyles(sourceFiles),
      collectViewerMessages(sourceFiles.map((file) => readFileSync(file, 'utf8')))
    )
  )
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
