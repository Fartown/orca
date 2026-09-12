import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { resolveOxcCliInvocation } from './oxc-cli-invocation.mjs'

export function filesRequiringFormat(root, files) {
  const canonicalRoot = realpathSync(root)
  let base
  try {
    base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return files
  }
  return files.filter((file) => {
    const absolute = path.resolve(root, file)
    try {
      const relative = path
        .relative(canonicalRoot, realpathSync(absolute))
        .split(path.sep)
        .join('/')
      const upstream = execFileSync('git', ['show', `${base}:${relative}`], {
        cwd: root,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      // Preserve exact upstream restores; lint still checks every staged source file.
      return !readFileSync(absolute).equals(upstream)
    } catch {
      return true
    }
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
