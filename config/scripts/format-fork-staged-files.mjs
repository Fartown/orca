import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { resolveOxcCliInvocation } from './oxc-cli-invocation.mjs'

function upstreamBase(root, head) {
  try {
    return execFileSync('git', ['merge-base', head, 'origin/main'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return null
  }
}

function upstreamBlob(root, base, relative) {
  try {
    return execFileSync('git', ['show', `${base}:${relative}`], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
  } catch {
    return null
  }
}

export function filesRequiringFormat(root, files) {
  const canonicalRoot = realpathSync(root)
  const headBase = upstreamBase(root, 'HEAD')
  if (!headBase) {
    return files
  }
  // A merge commit also brings in the upstream its other parent already merged.
  const mergeBase = upstreamBase(root, 'MERGE_HEAD')
  const bases = mergeBase && mergeBase !== headBase ? [headBase, mergeBase] : [headBase]
  return files.filter((file) => {
    const absolute = path.resolve(root, file)
    let content
    let relative
    try {
      content = readFileSync(absolute)
      relative = path.relative(canonicalRoot, realpathSync(absolute)).split(path.sep).join('/')
    } catch {
      return true
    }
    // Preserve exact upstream restores; lint still checks every staged source file.
    return !bases.some((base) => upstreamBlob(root, base, relative)?.equals(content))
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = filesRequiringFormat(process.cwd(), process.argv.slice(2))
  if (files.length > 0) {
    const root = path.resolve(import.meta.dirname, '../..')
    const invocation = resolveOxcCliInvocation('oxfmt', 'oxfmt', root)
    const result = spawnSync(invocation.command, [...invocation.prefixArgs, '--write', ...files], {
      stdio: 'inherit',
      windowsHide: true
    })
    if (result.error) {
      throw result.error
    }
    process.exitCode = result.status ?? 1
  }
}
