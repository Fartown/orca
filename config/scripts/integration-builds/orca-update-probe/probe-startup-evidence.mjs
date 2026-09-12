import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { writeJson } from '../signing-probe/probe-command.mjs'

export async function startupDeadline(promise, label, timeout = 2_000) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeout}ms`)),
          timeout
        )
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function observe(promise, label, timeout) {
  return startupDeadline(promise, label, timeout).catch((error) => ({ error: String(error) }))
}

export function processSample(pid, output, label) {
  if (!Number.isSafeInteger(pid) || pid <= 1) {
    return null
  }
  const path = join(output, `${label}-${pid}.sample.txt`)
  const result = spawnSync('/usr/bin/sample', [String(pid), '2', '-file', path], {
    timeout: 10_000,
    encoding: 'utf8'
  })
  return { pid, status: result.status, error: String(result.error ?? ''), stderr: result.stderr }
}

function ownedRendererProcesses(app) {
  const executable = app.process().spawnfile
  if (!executable) {
    return []
  }
  const appPath = dirname(dirname(dirname(executable)))
  const result = spawnSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], {
    encoding: 'utf8',
    timeout: 5_000
  })
  return (result.stdout ?? '').split('\n').flatMap((row) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(row)
    return match &&
      match[3].includes(`${appPath}/Contents/Frameworks/`) &&
      match[3].includes('--type=renderer')
      ? [{ pid: Number(match[1]), parentPid: Number(match[2]), command: match[3] }]
      : []
  })
}

async function debuggerEvidence(page) {
  const session = await startupDeadline(page.context().newCDPSession(page), 'CDP session')
  const paused = []
  session.on('Debugger.paused', (event) => {
    paused.push({
      reason: event.reason,
      frames: event.callFrames.map((frame) => ({
        functionName: frame.functionName,
        url: frame.url,
        location: frame.location
      }))
    })
  })
  try {
    const enabled = await observe(session.send('Debugger.enable'), 'Debugger.enable')
    const expression = await observe(
      session.send('Runtime.evaluate', { expression: '1+1', returnByValue: true }),
      'Direct CDP 1+1'
    )
    return { enabled, expression, paused }
  } finally {
    await startupDeadline(session.detach(), 'CDP detach')
  }
}

export async function startupEvidence(app, output, label) {
  const inventory = await observe(
    app.evaluate(({ app, BrowserWindow }) => ({
      metrics: app.getAppMetrics(),
      windows: BrowserWindow.getAllWindows().map((window) => ({
        id: window.id,
        visible: window.isVisible(),
        destroyed: window.isDestroyed(),
        url: window.webContents.getURL(),
        loading: window.webContents.isLoading(),
        crashed: window.webContents.isCrashed(),
        rendererPid: window.webContents.getOSProcessId()
      }))
    })),
    'Main process inventory',
    5_000
  )
  const main = { ...inventory, pid: app.process().pid ?? null }
  if (main.error) {
    main.sample = processSample(main.pid, output, `${label}-main`)
    main.renderers = ownedRendererProcesses(app)
  }
  writeJson(join(output, `${label}-windows.json`), main)
  console.log(`[real-orca] ${label} main diagnostics: ${JSON.stringify(main)}`)
  const observations = []
  for (const [index, page] of app.windows().entries()) {
    const observation = { index, url: page.url() }
    observation.expression = await observe(
      page.evaluate(() => 1 + 1),
      'Renderer 1+1'
    )
    observation.state = await observe(
      page.evaluate(() => ({
        title: document.title,
        readyState: document.readyState,
        hasApi: Boolean(window.api),
        hasUpdater: Boolean(window.api?.updater),
        hasStore: Boolean(window.__store),
        workspaceSessionReady: window.__store?.getState().workspaceSessionReady ?? null,
        e2eConfig: window.api?.e2e?.getConfig()
      })),
      'Renderer API/store'
    )
    observation.body = await observe(
      page.evaluate(() => document.body?.innerText?.slice(0, 16_000)),
      'Renderer DOM'
    )
    const capture = await observe(
      app.evaluate(async ({ BrowserWindow }, url) => {
        const window = BrowserWindow.getAllWindows().find(
          (item) => item.webContents.getURL() === url
        )
        if (!window) {
          throw new Error('Own renderer window not found')
        }
        return (await window.webContents.capturePage()).toPNG().toString('base64')
      }, page.url()),
      'Main process capturePage',
      5_000
    )
    if (typeof capture === 'string') {
      observation.screenshot = `screenshots/${label}-startup-${index}.png`
      writeFileSync(join(output, observation.screenshot), Buffer.from(capture, 'base64'))
    } else {
      observation.screenshotError = capture.error
    }
    if (observation.expression !== 2) {
      observation.debugger = await debuggerEvidence(page).catch((error) => ({
        error: String(error)
      }))
      const pid =
        main.windows?.find((window) => window.url === page.url())?.rendererPid ??
        main.renderers?.[index]?.pid
      observation.sample = processSample(pid, output, `${label}-renderer`)
    }
    writeFileSync(
      join(output, `${label}-startup-${index}-dom.txt`),
      typeof observation.body === 'string' ? observation.body : JSON.stringify(observation.body)
    )
    observations.push(observation)
    console.log(`[real-orca] ${label} renderer diagnostics: ${JSON.stringify(observation)}`)
  }
  writeJson(join(output, `${label}-startup.json`), observations)
}
