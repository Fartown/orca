import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { assertHostedMac } from '../signing-probe/probe-policy.mjs'
import { command, writeJson } from '../signing-probe/probe-command.mjs'
import { withExceptionMonitor } from './probe-exception-monitor.mjs'
import { stopOwnedProcesses, waitUntil } from './probe-runtime.mjs'

// The fixture runs from a scratch dir without node_modules; only modules the guard reaches may load.
const bundleOnlyReachedSources = {
  name: 'bundle-only-reached-sources',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^\.\.?\// }, async (args) => {
      if (args.pluginData === bundleOnlyReachedSources.name) {
        return undefined
      }
      const resolved = await pluginBuild.resolve(args.path, {
        kind: args.kind,
        importer: args.importer,
        resolveDir: args.resolveDir,
        pluginData: bundleOnlyReachedSources.name
      })
      if (resolved.errors.length > 0) {
        return undefined
      }
      return {
        path: resolved.path,
        namespace: resolved.namespace,
        external: resolved.external,
        sideEffects: false
      }
    })
  }
}

export async function launchIsolationFixtureSource(home, destination) {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
import { configureDevUserDataPath } from './src/main/startup/configure-process.ts';
import { app } from 'electron';
import { homedir } from 'node:os';
import { writeFileSync } from 'node:fs';
app.setActivationPolicy('prohibited');
const observed = { pid: process.pid, home: process.env.HOME, nodeHome: homedir(), mockKeychain: app.commandLine.hasSwitch('use-mock-keychain') };
try {
  configureDevUserDataPath(false);
  observed.electronHome = app.getPath('home');
  if (observed.home !== ${JSON.stringify(home)} || observed.nodeHome !== observed.home || observed.electronHome !== observed.home || !observed.mockKeychain) throw new Error('LaunchServices fixture home mismatch');
  process.env.HOME = ${JSON.stringify(join(home, 'wrong-fixture-home'))};
  try { configureDevUserDataPath(false); } catch (error) { observed.wrongHomeRejected = error.message.includes('disposable home boundary'); }
  process.env.HOME = ${JSON.stringify(home)};
  if (!observed.wrongHomeRejected) throw new Error('Production home guard accepted the wrong Node HOME');
} catch (error) { observed.error = String(error.stack ?? error); }
writeFileSync(${JSON.stringify(destination)}, JSON.stringify(observed));
app.exit(observed.error ? 1 : 0);
`
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    plugins: [bundleOnlyReachedSources],
    write: false
  })
  return result.outputFiles[0].text
}

export async function verifyLaunchIsolation(scratch, output, isolation) {
  assertHostedMac()
  console.log('[real-orca] Validate P2 isolation through a real hidden LaunchServices launch')
  const directory = join(scratch, 'launch-isolation-fixture')
  mkdirSync(directory)
  const destination = join(output, 'launch-isolation-preflight.json')
  const monitor = join(output, 'launch-isolation-fixture.jsonl')
  const entry = join(directory, 'main.cjs')
  const source = await launchIsolationFixtureSource(isolation.isolatedHome, destination)
  writeFileSync(
    entry,
    withExceptionMonitor(source, monitor, {
      home: isolation.isolatedHome,
      profile: isolation.env.ORCA_E2E_USER_DATA_DIR
    })
  )
  const executable = createRequire(import.meta.url)('electron')
  const appPath = dirname(dirname(dirname(executable)))
  try {
    const opened = command(
      '/usr/bin/open',
      [
        '-n',
        '-g',
        '-j',
        '-a',
        appPath,
        '--env',
        `ORCA_E2E_HOME_DIR=${isolation.isolatedHome}`,
        '--env',
        `ORCA_E2E_USER_DATA_DIR=${isolation.env.ORCA_E2E_USER_DATA_DIR}`,
        '--env',
        'ORCA_BACKGROUND_LAUNCH=1',
        '--env',
        'ORCA_E2E_HEADLESS=1',
        '--args',
        entry
      ],
      { timeout: 15_000 }
    )
    writeJson(join(output, 'launch-isolation-open.json'), opened)
    const observed = await waitUntil(
      () => JSON.parse(readFileSync(destination, 'utf8')),
      'LaunchServices fixture exercises the unchanged production home guard',
      20_000
    )
    if (observed.error || !observed.wrongHomeRejected) {
      throw new Error(observed.error ?? 'LaunchServices fixture did not reject wrong HOME')
    }
    console.log(
      '[real-orca] LaunchServices HOME restored; real production guard rejects wrong HOME'
    )
  } finally {
    await stopOwnedProcesses(directory)
  }
}
