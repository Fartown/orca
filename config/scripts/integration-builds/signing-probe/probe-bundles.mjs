import { mkdirSync, copyFileSync, existsSync, appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { command, writeJson } from './probe-command.mjs'
import { assertPinnedRequirement } from './probe-policy.mjs'

const require = createRequire(import.meta.url)
const source = import.meta.dirname
const electron = join(dirname(require.resolve('electron/package.json')), 'dist', 'Electron.app')

function buildApp(destination, version, config, signer, keychain) {
  if (existsSync(destination)) {
    throw new Error(`Refusing to overwrite a probe bundle: ${destination}`)
  }
  mkdirSync(dirname(destination), { recursive: true })
  command('/usr/bin/ditto', [electron, destination])
  command('/bin/chmod', ['-R', 'u+w', destination])
  const plist = join(destination, 'Contents', 'Info.plist')
  for (const [key, value] of Object.entries({
    CFBundleIdentifier: config.bundleId,
    CFBundleName: 'Orca Signing Probe',
    CFBundleDisplayName: 'Orca Signing Probe',
    CFBundleVersion: version,
    CFBundleShortVersionString: version
  })) {
    command('/usr/bin/plutil', ['-replace', key, '-string', value, plist])
  }
  command('/usr/bin/plutil', ['-replace', 'LSUIElement', '-bool', 'true', plist])
  const application = join(destination, 'Contents', 'Resources', 'app')
  mkdirSync(application, { recursive: true })
  for (const name of ['app-main.cjs', 'app-preload.cjs', 'app.html']) {
    copyFileSync(join(source, name), join(application, name))
  }
  writeJson(join(application, 'package.json'), {
    name: 'orca-isolated-signing-probe',
    version,
    main: 'app-main.cjs'
  })
  writeJson(join(application, 'probe-config.json'), config)
  writeJson(join(application, 'signed-payload.json'), { version })
  command('/usr/bin/codesign', [
    '--force',
    '--deep',
    '--sign',
    signer.fingerprint,
    '--keychain',
    keychain,
    destination
  ])
  const designated = command('/usr/bin/codesign', ['-d', '-r-', destination])
    .stdout.trim()
    .replace(/^# designated => /, '')
  assertPinnedRequirement(designated, signer.fingerprint)
  command('/usr/bin/codesign', ['--verify', '--deep', '--strict', destination])
  return { path: destination, version, designated, fingerprint: signer.fingerprint }
}

export function buildProbeCase(root, name, config, signing) {
  const directory = join(root, name)
  mkdirSync(directory, { recursive: true })
  const old = buildApp(
    join(directory, 'installed', 'Orca Signing Probe.app'),
    '1.0.0',
    config,
    signing.identities[0],
    signing.keychain
  )
  const next = buildApp(
    join(directory, 'candidate', 'Orca Signing Probe.app'),
    '1.0.1',
    config,
    signing.identities[name === 'wrong-certificate' ? 1 : 0],
    signing.keychain
  )
  if (name === 'tampered') {
    appendFileSync(
      join(next.path, 'Contents', 'Resources', 'app', 'signed-payload.json'),
      '\nchanged after signing\n'
    )
  }
  const zip = join(directory, 'candidate.zip')
  command('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', next.path, zip], {
    timeout: 180_000
  })
  const testCase = { name, directory, config, old, next, zip }
  writeJson(join(directory, 'bundles.json'), testCase)
  return testCase
}

export function verifyProbeCase(testCase) {
  const options = { allowFailure: true }
  const result = {
    old: command(
      '/usr/bin/codesign',
      ['--verify', '--deep', '--strict', testCase.old.path],
      options
    ),
    next: command(
      '/usr/bin/codesign',
      ['--verify', '--deep', '--strict', testCase.next.path],
      options
    ),
    oldRequirementAgainstNext: command(
      '/usr/bin/codesign',
      ['--verify', '--deep', '--strict', '-R', `=${testCase.old.designated}`, testCase.next.path],
      options
    )
  }
  writeJson(join(testCase.directory, 'client-codesign.json'), result)
  return result
}

export function diskVersion(application) {
  return command('/usr/bin/plutil', [
    '-extract',
    'CFBundleShortVersionString',
    'raw',
    '-o',
    '-',
    join(application, 'Contents', 'Info.plist')
  ]).stdout.trim()
}
