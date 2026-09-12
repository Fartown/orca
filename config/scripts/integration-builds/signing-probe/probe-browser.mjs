import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  existsSync,
  statSync,
  createReadStream
} from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import http from 'node:http'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { command, writeJson } from './probe-command.mjs'
import { diskVersion } from './probe-bundles.mjs'

export async function freePort() {
  const server = http.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function until(callback, timeout = 90_000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const result = await callback()
    if (result) {
      return result
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Probe condition not reached in ${timeout}ms`)
}

function events(directory) {
  const file = join(directory, 'events.jsonl')
  if (!existsSync(file)) {
    return []
  }
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
}

export async function runProbeCase(testCase) {
  const { directory, config, old, name } = testCase
  const screenshots = []
  const requests = []
  const processes = []
  const browsers = []
  let outcome
  const server = http.createServer((request, response) => {
    requests.push({ time: new Date().toISOString(), method: request.method, url: request.url })
    writeJson(join(directory, 'requests.json'), requests)
    if (request.url === '/feed') {
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          url: `http://127.0.0.1:${config.feedPort}/candidate.zip`,
          name: '1.0.1',
          notes: 'Disposable code-signing probe',
          pub_date: new Date().toISOString()
        })
      )
    } else if (request.url === '/candidate.zip') {
      response.setHeader('Content-Type', 'application/zip')
      response.setHeader('Content-Length', statSync(testCase.zip).size)
      createReadStream(testCase.zip).pipe(response)
    } else {
      response.writeHead(404)
      response.end()
    }
  })
  const log = openSync(join(directory, 'process.log'), 'a')
  function launch() {
    const child = spawn(join(old.path, 'Contents', 'MacOS', 'Electron'), [], {
      env: {
        ...process.env,
        ORCA_BACKGROUND_LAUNCH: '1',
        CFFIXED_USER_HOME: join(directory, 'fixed-home')
      },
      stdio: ['ignore', log, log]
    })
    processes.push(child)
    return child
  }
  async function connect(expectedVersion, expectedPid) {
    const ready = await until(() =>
      events(directory).findLast(
        (event) =>
          event.kind === 'ready' &&
          event.version === expectedVersion &&
          (!expectedPid || event.pid === expectedPid)
      )
    )
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${config.cdpPort}`, {
      timeout: 15_000
    })
    browsers.push(browser)
    const page = browser.contexts()[0].pages()[0]
    await page.waitForFunction(
      (pid) => window.probeEvents?.some((event) => event.kind === 'ready' && event.pid === pid),
      ready.pid
    )
    assert.equal(ready.isVisible, false)
    return { browser, page, ready }
  }
  async function capture(page, label) {
    const imagePath = join(directory, `${label}.png`)
    await page.screenshot({ path: imagePath, fullPage: true })
    const state = await page.evaluate(() => ({
      events: window.probeEvents,
      body: document.body.innerText
    }))
    writeJson(join(directory, `${label}.json`), state)
    screenshots.push(`${name}/${label}.png`)
    return state
  }
  try {
    mkdirSync(join(directory, 'fixed-home'), { recursive: true })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(config.feedPort, '127.0.0.1', resolve)
    })
    const child = launch()
    const initial = await connect('1.0.0', child.pid)
    await capture(initial.page, '01-initial')
    await initial.page.getByRole('button', { name: 'Check for update', exact: true }).click()
    await initial.page.waitForFunction(
      () => window.probeEvents.some((event) => ['error', 'update-downloaded'].includes(event.kind)),
      undefined,
      { timeout: 120_000 }
    )
    const staged = await capture(initial.page, '02-native-result')
    assert(
      requests.some((request) => request.url === '/candidate.zip'),
      'Native updater never requested the candidate ZIP'
    )
    if (name === 'same-certificate') {
      assert(
        staged.events.some((event) => event.kind === 'update-downloaded'),
        JSON.stringify(staged.events.at(-1))
      )
      await initial.page.getByRole('button', { name: 'Install and restart', exact: true }).click()
      await until(() => {
        try {
          return diskVersion(old.path) === '1.0.1'
        } catch {
          return false
        }
      })
      const restarted = await connect('1.0.1')
      assert.notEqual(restarted.ready.pid, child.pid)
      await capture(restarted.page, '03-restarted-new-version')
      command('/usr/bin/codesign', [
        '--verify',
        '--deep',
        '--strict',
        '-R',
        `=${old.designated}`,
        old.path
      ])
      outcome = {
        status: 'PASS',
        nativeStaged: true,
        diskVersion: diskVersion(old.path),
        oldPid: child.pid,
        newPid: restarted.ready.pid,
        newProcessVersion: restarted.ready.version
      }
    } else {
      const error = staged.events.find((event) => event.kind === 'error')
      assert(
        error && /signature|validation|code requirement/i.test(error.message),
        JSON.stringify(staged.events)
      )
      assert(!staged.events.some((event) => event.kind === 'update-downloaded'))
      assert.equal(diskVersion(old.path), '1.0.0')
      command('/usr/bin/codesign', [
        '--verify',
        '--deep',
        '--strict',
        '-R',
        `=${old.designated}`,
        old.path
      ])
      await initial.page.evaluate(() => window.probe.quit())
      await until(() => child.exitCode !== null)
      const relaunched = launch()
      const recovered = await connect('1.0.0', relaunched.pid)
      assert.equal(recovered.ready.pid, relaunched.pid)
      await capture(recovered.page, '03-original-app-relaunched')
      outcome = {
        status: 'PASS',
        rejected: error.message,
        diskVersion: diskVersion(old.path),
        originalRelaunchPid: recovered.ready.pid,
        originalProcessVersion: recovered.ready.version
      }
    }
  } catch (error) {
    outcome = { status: 'FAIL', error: String(error), stack: error.stack }
  } finally {
    for (const browser of browsers) {
      try {
        await browser.close()
      } catch {
        /* Already exited during install. */
      }
    }
    const table = command('/bin/ps', ['-axo', 'pid=,command='], { allowFailure: true }).stdout
    const ownedPids = new Set(
      table.split('\n').flatMap((line) => {
        const match = /^\s*(\d+)\s+(.+)$/.exec(line)
        return match && (match[2].includes(old.path) || match[2].includes(config.bundleId))
          ? [Number(match[1])]
          : []
      })
    )
    const stopped = []
    for (const pid of ownedPids) {
      const processInfo = command('/bin/ps', ['-p', String(pid), '-o', 'command='], {
        allowFailure: true
      }).stdout
      if (processInfo.includes(old.path) || processInfo.includes(config.bundleId)) {
        try {
          process.kill(pid, 'SIGTERM')
          stopped.push(pid)
        } catch {
          /* The process already exited. */
        }
      }
    }
    server.closeAllConnections()
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve))
    }
    closeSync(log)
    writeJson(join(directory, 'cleanup.json'), {
      stoppedOwnedPids: stopped,
      httpServerClosed: true
    })
  }
  const result = { name, ...outcome, screenshots, events: events(directory) }
  writeJson(join(directory, 'result.json'), result)
  return result
}
