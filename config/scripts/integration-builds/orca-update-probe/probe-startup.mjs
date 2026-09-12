import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSync } from 'esbuild'
import { writeJson } from '../signing-probe/probe-command.mjs'
import { assertElectronResolvedIsolatedHome } from '../../../../tests/e2e/helpers/electron-home-isolation.ts'

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

async function startupEvidence(app, output, label) {
  const observations = []
  for (const [index, page] of app.windows().entries()) {
    const observation = { index, url: page.url() }
    try {
      Object.assign(
        observation,
        await page.evaluate(() => ({
          title: document.title,
          readyState: document.readyState,
          hasApi: Boolean(window.api),
          hasUpdater: Boolean(window.api?.updater),
          hasStore: Boolean(window.__store),
          workspaceSessionReady: window.__store?.getState().workspaceSessionReady ?? null,
          e2eConfig: window.api?.e2e?.getConfig(),
          body: document.body?.innerText?.slice(0, 16_000)
        }))
      )
      const screenshot = `screenshots/${label}-startup-${index}.png`
      await page.screenshot({ path: join(output, screenshot), timeout: 10_000 })
      observation.screenshot = screenshot
      writeFileSync(join(output, `${label}-startup-${index}-dom.txt`), observation.body ?? '')
    } catch (error) {
      observation.diagnosticError = String(error)
    }
    observations.push(observation)
  }
  writeJson(join(output, `${label}-startup.json`), observations)
  console.log(`[real-orca] ${label} startup diagnostics: ${JSON.stringify(observations)}`)
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
    await close(app)
    throw error
  }
}
