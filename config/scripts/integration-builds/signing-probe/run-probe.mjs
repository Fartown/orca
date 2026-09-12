import { mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { probeOptions, assertHostedMac } from './probe-policy.mjs'
import { command } from './probe-command.mjs'
import { createProbeIdentities } from './probe-identities.mjs'
import { buildProbeCase, verifyProbeCase } from './probe-bundles.mjs'
import { freePort, runProbeCase } from './probe-browser.mjs'
import { writeProbeReport } from './probe-report.mjs'

const require = createRequire(import.meta.url)

export async function runProbe(args) {
  const options = probeOptions(args)
  if (options.validateOnly) {
    console.log(
      JSON.stringify({
        validated: true,
        cases: options.cases,
        electron: require('electron/package.json').version,
        playwright: require('playwright/package.json').version,
        trustChanged: false
      })
    )
    return
  }
  assertHostedMac()
  if (existsSync(options.output) && readdirSync(options.output).length > 0) {
    throw new Error('Probe output must be new or empty')
  }
  mkdirSync(options.output, { recursive: true })
  writeFileSync(
    join(options.output, 'test-plan.md'),
    '# Native signing probe plan\n\nSame certificate: update-downloaded, quitAndInstall, disk 1.0.1 and a new 1.0.1 process. Wrong certificate and tampered candidate: native signature error, disk remains 1.0.0 and original app relaunches. All windows remain hidden. Build-time user code-signing trust and private material are removed before every runtime case. Real Orca business features and Gatekeeper first installation are out of scope.\n'
  )
  const startedAt = new Date().toISOString()
  const environment = {
    url: 'Native Squirrel feed on per-case loopback ports',
    browser: `Electron ${require('electron/package.json').version} / Playwright ${require('playwright/package.json').version}`,
    viewport: '1100×780 hidden BrowserWindow',
    platform: process.platform,
    arch: process.arch,
    macOS: command('/usr/bin/sw_vers', ['-productVersion']).stdout.trim(),
    sha: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    test_data: 'Ephemeral self-signed identities; no user Orca app'
  }
  const results = []
  let signing, failure
  const cleanup = () => signing?.cleanup()
  const onSignal = () => {
    try {
      cleanup()
    } finally {
      process.exit(130)
    }
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  try {
    signing = createProbeIdentities(options.output)
    const cases = []
    for (const name of options.cases) {
      const feedPort = await freePort()
      const config = {
        output: join(options.output, name),
        cdpPort: await freePort(),
        feedPort,
        feed: `http://127.0.0.1:${feedPort}/feed`,
        bundleId: `dev.orca.ci-signing.${process.env.GITHUB_RUN_ID}.${process.arch}.${name}`
      }
      console.log(`Building ${name} with an ephemeral fixed certificate`)
      cases.push(buildProbeCase(options.output, name, config, signing))
    }
    signing.removeTrustBeforeRuntime()
    signing.cleanup()
    for (const testCase of cases) {
      verifyProbeCase(testCase)
      console.log(`Running native CDP case: ${testCase.name}`)
      const result = await runProbeCase(testCase)
      results.push(result)
      console.log(`${testCase.name}: ${result.status}`)
    }
  } catch (error) {
    failure = String(error)
    console.error(failure)
  } finally {
    try {
      cleanup()
    } catch (error) {
      failure = `${failure ?? ''}\n${String(error)}`
    }
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
    if (
      writeProbeReport(options.output, { startedAt, environment, results, error: failure }) !==
      'PASS'
    ) {
      process.exitCode = 1
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runProbe(process.argv.slice(2)).catch((error) => {
    console.error(String(error))
    process.exitCode = 1
  })
}
