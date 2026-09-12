import { spawnSync } from 'node:child_process'
import { closeSync, openSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildSync } from 'esbuild'
import { command, writeJson } from '../signing-probe/probe-command.mjs'

export function runBuild(args, env, log) {
  console.log(`[real-orca] pnpm ${args.join(' ')}`)
  const descriptor = openSync(log, 'w')
  try {
    const result = spawnSync('pnpm', args, {
      env,
      stdio: ['ignore', descriptor, descriptor],
      timeout: 30 * 60_000
    })
    if (result.status !== 0 || result.error) {
      console.error(readFileSync(log, 'utf8').slice(-16_000))
      throw new Error(
        `Build failed: ${args[0]}; see ${log}; ${result.error?.message ?? result.status}`
      )
    }
  } finally {
    closeSync(descriptor)
  }
}

export async function completedProfile() {
  const result = buildSync({
    entryPoints: ['tests/e2e/helpers/e2e-completed-onboarding-profile.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false
  })
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  )
  return module.getE2ECompletedOnboardingProfile()
}

export function packageVersions({ scratch, output, isolation, signer }) {
  const sha = command('git', ['rev-parse', 'HEAD']).stdout.trim()
  const base = JSON.parse(readFileSync('package.json', 'utf8')).version.replace(/-.*/, '')
  const timestamp = Date.now()
  const versions = [0, 1].map((offset) => `${base}-local.${timestamp + offset}.${sha.slice(0, 12)}`)
  const tag = `integration-${process.env.GITHUB_RUN_ID}-${sha.slice(0, 12)}`
  const env = {
    ...process.env,
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_COMPUTER_MACOS_SIGN_IDENTITY: '-',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    ORCA_LOCAL_BUILD_VERSION: versions[0],
    ORCA_INTEGRATION_TAG: tag,
    ORCA_INTEGRATION_SIGN_EXECUTABLE: signer.executable,
    ORCA_INTEGRATION_SIGN_CERTIFICATE: signer.certificate,
    ORCA_INTEGRATION_SIGN_PRIVATE_KEY: signer.privateKey,
    VITE_EXPOSE_STORE: 'true'
  }
  delete env.ORCA_INTEGRATION_SIGN_IDENTITY
  const config = join(scratch, 'probe-builder.cjs')
  const launchEnvironment = {
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_E2E_HEADLESS: '1',
    ORCA_E2E_HOME_DIR: isolation.isolatedHome,
    ORCA_E2E_USER_DATA_DIR: isolation.env.ORCA_E2E_USER_DATA_DIR,
    CFFIXED_USER_HOME: isolation.isolatedHome,
    HOME: isolation.isolatedHome,
    USERPROFILE: isolation.isolatedHome,
    ELECTRON_ENABLE_LOGGING: '1',
    ELECTRON_LOG_FILE: join(isolation.env.ORCA_E2E_USER_DATA_DIR, 'native-electron.log')
  }
  writeFileSync(
    config,
    `const base = require(${JSON.stringify(resolve('config/scripts/integration-builds/electron-builder.cjs'))});\nmodule.exports = { ...base, appId: 'dev.orca.native-update-probe.${process.env.GITHUB_RUN_ID}.${process.arch}', mac: { ...base.mac, identity: '-', extendInfo: { ...base.mac.extendInfo, LSUIElement: true, LSEnvironment: ${JSON.stringify(launchEnvironment)} } } };\n`
  )
  runBuild(['run', 'build:release'], env, join(output, 'build-release.log'))
  const apps = versions.map((version, index) => {
    const destination = join(scratch, `package-${index}`)
    runBuild(
      [
        'exec',
        'electron-builder',
        '--config',
        config,
        '--mac',
        'zip',
        `--${process.arch}`,
        '--publish',
        'never',
        `--config.directories.output=${destination}`
      ],
      { ...env, ORCA_LOCAL_BUILD_VERSION: version },
      join(output, `package-${index}.log`)
    )
    const app = join(destination, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Orca.app')
    if (!existsSync(join(app, 'Contents', 'Resources', 'app.asar'))) {
      throw new Error('Packaging did not produce the real Orca asar')
    }
    if (!existsSync(join(app, 'Contents', 'Resources', 'app-update.yml'))) {
      throw new Error('Normal ZIP packaging did not include updater configuration')
    }
    return app
  })
  const zips = versions.map((_, index) =>
    join(scratch, `package-${index}`, `orca-integration-macos-${process.arch}.zip`)
  )
  if (zips.some((zip) => !existsSync(zip))) {
    throw new Error('Normal packaging did not produce both updater ZIP artifacts')
  }
  writeJson(join(output, 'build-identity.json'), {
    sha,
    tag,
    versions,
    arch: process.arch,
    releaseBuilds: 1,
    zipPackages: 2,
    storeExposedForTestSetup: true
  })
  return { sha, tag, versions, apps, zips }
}
