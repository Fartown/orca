import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  rmSync,
  writeFileSync,
  readFileSync,
  cpSync
} from 'node:fs'
import { join, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createElectronHomeIsolation } from '../../../../tests/e2e/helpers/electron-home-isolation.ts'
import { assertHostedMac, probeOptions } from '../signing-probe/probe-policy.mjs'
import { createProbeIdentities } from '../signing-probe/probe-identities.mjs'
import { command, writeJson } from '../signing-probe/probe-command.mjs'
import { ensureRcodesign } from '../mac-rcodesign.cjs'
import { verifyPackageSignature } from '../mac-package-signature.mjs'
import { completedProfile, packageVersions } from './probe-package.mjs'
import { createForkFeed, routeForkRequests } from './probe-feed.mjs'
import { beginReport, finishReport, recordCheckpoint } from './probe-report.mjs'
import {
  createTerminal,
  launchOrca,
  matchingAppProcesses,
  snapshot,
  stopOwnedProcesses,
  terminalContinuity,
  verifyNativeRuntime,
  waitUntil
} from './probe-runtime.mjs'

const options = probeOptions(process.argv.slice(2))
if (options.validateOnly) {
  console.log('Real Orca P2 CLI validated. Actual execution requires ephemeral hosted macOS.')
} else {
  assertHostedMac()
  if (existsSync(options.output)) {
    throw new Error('Use a new evidence directory for each attempt')
  }
  await run(options.output)
}

async function run(output) {
  mkdirSync(join(output, 'screenshots'), { recursive: true })
  const report = beginReport(output)
  const scratch = mkdtempSync(join(process.env.RUNNER_TEMP, 'orca-native-update-'))
  const profile = join(scratch, 'profile')
  mkdirSync(profile)
  const isolation = createElectronHomeIsolation({
    inheritedEnv: process.env,
    launchEnv: {},
    extraEnv: {},
    userDataDir: profile
  })
  const cleanup = { errors: [], ownProcesses: [], privateMaterial: 'not created' }
  let identity
  let feed
  let activeApp
  let failure
  try {
    writeFileSync(join(profile, 'orca-data.json'), JSON.stringify(await completedProfile()))
    const executable = await ensureRcodesign(join(scratch, 'signing-tool'))
    identity = createProbeIdentities(output)
    cleanup.privateMaterial = 'temporary PEM created; cleanup pending'
    const publisher = identity.identities[0]
    const build = packageVersions({
      scratch,
      output,
      isolation,
      signer: { executable, certificate: publisher.certificate, privateKey: publisher.privateKey }
    })
    for (const [index, appPath] of build.apps.entries()) {
      const signed = verifyPackageSignature(appPath, {
        certificate: readFileSync(publisher.certificate),
        arch: process.arch,
        version: build.versions[index]
      })
      writeJson(join(output, `package-signature-${index}.json`), signed)
      cpSync(
        join(dirname(appPath), 'publisher-signing-evidence'),
        join(output, `signature-${index}`),
        { recursive: true }
      )
    }
    identity.removeTrustBeforeRuntime()
    identity.cleanup()
    cleanup.privateMaterial = 'removed before runtime'
    const zip = join(scratch, 'update.zip')
    command('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', build.apps[1], zip], {
      timeout: 600_000
    })
    feed = await createForkFeed({
      zip,
      sha: build.sha,
      tag: build.tag,
      version: build.versions[1],
      output: join(output, 'network.json')
    })
    const first = await launchOrca(build.apps[0], isolation, output, 'before')
    report.runtime = {
      electron: first.details.electronVersion,
      chromium: first.details.chromiumVersion
    }
    activeApp = first.app
    if (first.details.version !== build.versions[0]) {
      throw new Error('Initial process is not version A')
    }
    await routeForkRequests(first.app, feed.url, build.tag)
    const terminal = await createTerminal(first.page, isolation.isolatedHome)
    const continuityValue = randomBytes(16).toString('hex')
    const before = await terminalContinuity(first.page, continuityValue, true)
    writeJson(join(output, 'terminal-before.json'), { ...terminal, ...before })
    recordCheckpoint(
      report,
      'A opens a real folder terminal and executes a command',
      before.text,
      await snapshot(first.page, output, '01-before-update'),
      ['terminal-before.json']
    )
    await first.page.evaluate(() => {
      window.__orcaProbeStatuses = []
      window.api.updater.onStatus((status) => window.__orcaProbeStatuses.push(status))
      return window.api.updater.check()
    })
    const available = await waitForStatus(first.page, 'available')
    if (available.version !== build.versions[1]) {
      throw new Error('Default fork check did not resolve B')
    }
    recordCheckpoint(
      report,
      'Default fork update check offers B',
      JSON.stringify(available),
      await snapshot(first.page, output, '02-available')
    )
    await first.page.evaluate(() => window.api.updater.download())
    const downloaded = await waitForStatus(first.page, 'downloaded')
    recordCheckpoint(
      report,
      'Native updater verifies and stages B',
      JSON.stringify(downloaded),
      await snapshot(first.page, output, '03-downloaded')
    )
    writeJson(
      join(output, 'updater-statuses.json'),
      await first.page.evaluate(() => window.__orcaProbeStatuses)
    )
    writeJson(
      join(output, 'fork-request-routing.json'),
      await first.app.evaluate(() => globalThis.__orcaProbeRequests)
    )
    await first.page
      .evaluate(() => {
        void window.api.updater.quitAndInstall()
      })
      .catch(() => undefined)
    const native = await waitUntil(
      () => {
        const diskVersion = command(
          '/usr/bin/plutil',
          [
            '-extract',
            'CFBundleShortVersionString',
            'raw',
            join(build.apps[0], 'Contents', 'Info.plist')
          ],
          { allowFailure: true }
        ).stdout.trim()
        const process = matchingAppProcesses(build.apps[0]).find(
          (candidate) => candidate.pid !== first.details.pid
        )
        return diskVersion === build.versions[1] && process ? { diskVersion, ...process } : null
      },
      'Native replacement and new B process',
      180_000
    )
    const readiness = await verifyNativeRuntime(build.apps[0], profile, native.pid)
    writeJson(join(output, 'native-relaunch.json'), {
      ...native,
      readiness,
      oldPid: first.details.pid,
      rendererAcceptance:
        'Instrumented reopen follows native relaunch; native LaunchServices process observed separately.'
    })
    command('/usr/bin/codesign', ['--verify', '--deep', '--strict', build.apps[0]])
    // LaunchServices does not promise to preserve Playwright's debugger arguments.
    process.kill(native.pid, 'SIGTERM')
    await waitUntil(
      () => !matchingAppProcesses(build.apps[0]).length,
      'Observed native B process exits for instrumented reopen',
      30_000
    )
    activeApp = null
    const second = await launchOrca(build.apps[0], isolation, output, 'after')
    activeApp = second.app
    if (second.details.version !== build.versions[1]) {
      throw new Error('Instrumented installed process is not B')
    }
    const savedTab = second.page.locator(`[data-tab-id="${terminal.tabId}"]`).first()
    await savedTab.waitFor({ state: 'visible', timeout: 60_000 })
    await savedTab.click({ force: true })
    const after = await terminalContinuity(second.page, continuityValue)
    writeJson(join(output, 'terminal-after.json'), after)
    if (after.ptyId !== before.ptyId) {
      throw new Error('Original shell marker survived but PTY identity changed')
    }
    recordCheckpoint(
      report,
      'Native replacement launches B and its saved terminal executes again',
      `Native PID ${native.pid}; disk ${native.diskVersion}; saved tab ${terminal.tabId}; ${after.text}`,
      await snapshot(second.page, output, '04-after-update'),
      ['native-relaunch.json', 'terminal-after.json', 'after-process.json']
    )
  } catch (error) {
    failure = error
    console.error(error)
    if (error.terminalObservation) {
      writeJson(join(output, 'terminal-failure.json'), error.terminalObservation)
    }
    const page = activeApp?.windows()[0]
    if (page) {
      await snapshot(page, output, '99-failure').catch(() => undefined)
    }
  } finally {
    for (const operation of [
      async () => {
        if (activeApp) {
          await activeApp.close()
        }
      },
      async () => {
        cleanup.ownProcesses = await stopOwnedProcesses(scratch)
      },
      async () => {
        if (feed) {
          await feed.close()
        }
      },
      async () => {
        identity?.cleanup()
        if (identity && cleanup.privateMaterial !== 'removed before runtime') {
          cleanup.privateMaterial = 'removed during failure cleanup'
        }
      }
    ]) {
      try {
        await operation()
      } catch (error) {
        cleanup.errors.push(String(error))
      }
    }
    if (!cleanup.errors.length) {
      rmSync(scratch, { recursive: true, force: true })
    }
    cleanup.buildDirectoryRemoved = !existsSync(scratch)
    finishReport(
      output,
      report,
      failure ?? (cleanup.errors.length ? new Error(cleanup.errors.join('; ')) : null),
      cleanup
    )
  }
  if (failure || cleanup.errors.length) {
    process.exitCode = 1
  }
}

async function waitForStatus(page, expected) {
  const settled = await waitUntil(
    async () => {
      const status = await page.evaluate(() => window.api.updater.getStatus())
      return status.state === expected || status.state === 'error' ? status : null
    },
    `Updater ${expected}`,
    240_000
  )
  if (settled.state === 'error') {
    throw new Error(`Updater rejected ${expected}: ${settled.message}`)
  }
  return settled
}
