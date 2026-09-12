const { createHash } = require('node:crypto')
const { existsSync, readFileSync, readdirSync, openSync, readSync, closeSync } = require('node:fs')
const { join, relative } = require('node:path')
const { spawnSync } = require('node:child_process')
const { isDeepStrictEqual } = require('node:util')

function run(executable, args, input) {
  const result = spawnSync(executable, args, { encoding: 'utf8', input, timeout: 30_000 })
  if (result.error || result.status !== 0) {
    throw new Error(`Signing metadata read failed: ${result.stderr || result.error?.message}`)
  }
  return result
}

function appBundles(root) {
  const bundles = [root]
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'Resources') {
        continue
      }
      const child = join(directory, entry.name)
      if (entry.name.endsWith('.app')) {
        bundles.push(child)
      }
      visit(child)
    }
  }
  visit(root)
  return bundles
}

function captureSigningMetadata(root) {
  return appBundles(root).map((appPath) => {
    const info = join(appPath, 'Contents', 'Info.plist')
    const asar = join(appPath, 'Contents', 'Resources', 'app.asar')
    const signature = run('/usr/bin/codesign', ['-d', '--verbose=4', appPath]).stderr
    const entitlements = run('/usr/bin/codesign', [
      '-d',
      '--entitlements',
      ':-',
      appPath
    ]).stdout.trim()
    return {
      path: relative(root, appPath),
      infoSha256: createHash('sha256').update(readFileSync(info)).digest('hex'),
      asarSha256: existsSync(asar)
        ? createHash('sha256').update(readFileSync(asar)).digest('hex')
        : null,
      flags: Number.parseInt(/flags=0x([a-f0-9]+)/i.exec(signature)?.[1] ?? '0', 16) & ~0x20002,
      entitlements: entitlements
        ? JSON.parse(
            run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], entitlements).stdout
          )
        : null
    }
  })
}

function assertSigningMetadata(before, after) {
  if (!isDeepStrictEqual(before, after)) {
    throw new Error(
      'Re-signing changed existing entitlements, code flags, Info.plist or asar contents'
    )
  }
}

function findObjectResources(root) {
  const resources = join(root, 'Contents', 'Resources')
  const objects = []
  if (!existsSync(resources)) {
    return objects
  }
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory() && !entry.name.endsWith('.app')) {
        visit(file)
      } else if (entry.isFile() && entry.name.endsWith('.o')) {
        const header = Buffer.alloc(16)
        const descriptor = openSync(file, 'r')
        let bytes
        try {
          bytes = readSync(descriptor, header, 0, header.length, 0)
        } finally {
          closeSync(descriptor)
        }
        if (bytes !== header.length) {
          continue
        }
        const magic = header.readUInt32BE(0)
        const type = [0xfeedface, 0xfeedfacf].includes(magic)
          ? header.readUInt32BE(12)
          : [0xcefaedfe, 0xcffaedfe].includes(magic)
            ? header.readUInt32LE(12)
            : null
        if (type === 1) {
          objects.push(relative(root, file).split('\\').join('/'))
        }
      }
    }
  }
  visit(resources)
  return objects.sort()
}

function exactSigningExclusions(paths) {
  return paths.flatMap((file) => [
    '--exclude',
    file.replace(/[*?[\]]/g, (character) => `[${character}]`)
  ])
}

module.exports = {
  captureSigningMetadata,
  assertSigningMetadata,
  findObjectResources,
  exactSigningExclusions
}
