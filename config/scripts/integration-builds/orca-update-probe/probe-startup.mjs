import { appendFileSync, cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildSync } from 'esbuild'
import { writeJson } from '../signing-probe/probe-command.mjs'
import { assertElectronResolvedIsolatedHome } from '../../../../tests/e2e/helpers/electron-home-isolation.ts'
import { startupEvidence } from './probe-startup-evidence.mjs'
export { startupDeadline } from './probe-startup-evidence.mjs'

let shutdownModule
export async function closeOrca(app) {
  shutdownModule ??= (async () => {
    const bundle = buildSync({
      entryPoints: ['tests/e2e/helpers/electron-process-shutdown.ts'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false
    })
    return import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
    )
  })()
  await (await shutdownModule).closeElectronAppForE2E(app)
}

export async function readyOrca(app, isolation, output, label, close = closeOrca) {
  const log = join(output, `${label}-process.log`)
  for (const stream of [app.process().stdout, app.process().stderr]) {
    stream?.on('data', (chunk) => appendFileSync(log, chunk))
  }
  try {
    const details = await app.evaluate(({ app, BrowserWindow }) => ({
      home: app.getPath('home'),
      version: app.getVersion(),
      pid: process.pid,
      execPath: process.execPath,
      packaged: app.isPackaged,
      electronVersion: process.versions.electron,
      chromiumVersion: process.versions.chrome,
      visibleWindows: BrowserWindow.getAllWindows().filter((window) => window.isVisible()).length
    }))
    writeJson(join(output, `${label}-process.json`), details)
    assertElectronResolvedIsolatedHome(details.home, isolation)
    if (!details.packaged || details.visibleWindows) {
      throw new Error('Expected a hidden, packaged Orca process')
    }
    await app.evaluate(({ app, BrowserWindow }) => {
      app.on('render-process-gone', (_event, contents, details) =>
        console.error('[probe] render-process-gone', contents.id, details)
      )
      for (const window of BrowserWindow.getAllWindows()) {
        window.on('unresponsive', () => console.error('[probe] unresponsive', window.id))
        window.on('responsive', () => console.error('[probe] responsive', window.id))
      }
    })
    const page = await app.firstWindow({ timeout: 120_000 })
    page.on('pageerror', (error) => appendFileSync(log, `renderer: ${error.stack}\n`))
    page.on('console', (message) => appendFileSync(log, `${message.type()}: ${message.text()}\n`))
    await page.waitForLoadState('domcontentloaded')
    console.log(`[real-orca] ${label} hidden renderer loaded: ${page.url()}`)
    await startupEvidence(app, output, `${label}-initial`)
    await page.waitForFunction(
      () => window.api?.updater && window.__store?.getState().workspaceSessionReady === true,
      null,
      { timeout: 120_000 }
    )
    return { app, page, details }
  } catch (error) {
    await startupEvidence(app, output, `${label}-failed`).catch((diagnosticError) => {
      appendFileSync(log, `startup evidence failed: ${diagnosticError}\n`)
    })
    const logs = join(isolation.env?.ORCA_E2E_USER_DATA_DIR ?? isolation.isolatedHome, 'logs')
    if (existsSync(logs)) {
      cpSync(logs, join(output, `${label}-runtime-logs`), { recursive: true })
    }
    await close(app)
    throw error
  }
}
