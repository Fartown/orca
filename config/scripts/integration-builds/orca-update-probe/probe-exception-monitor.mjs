import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { assertHostedMac } from '../signing-probe/probe-policy.mjs'
import { writeJson } from '../signing-probe/probe-command.mjs'

export function withExceptionMonitor(source, destination) {
  const banner = `;(() => {
  const record = (read) => {
    try { require('node:fs').appendFileSync(${JSON.stringify(destination)}, JSON.stringify({ pid: process.pid, ...read() }) + '\\n'); } catch {}
  };
  record(() => ({ event: 'observer-installed', scope: 'P2-only signed test build', cwd: process.cwd(), home: process.env.HOME, e2eHome: process.env.ORCA_E2E_HOME_DIR, e2eUserData: process.env.ORCA_E2E_USER_DATA_DIR }));
  process.on('uncaughtExceptionMonitor', (error, origin) => record(() => ({ event: 'uncaughtException', origin, stack: String(error?.stack ?? error).slice(0, 16000) })));
})();\n`
  const directive =
    /^(?:(?:#![^\n]*\n)?\s*(?:"use strict"|'use strict');?\s*)/.exec(source)?.[0] ?? ''
  return `${directive}${banner}${source.slice(directive.length)}`
}

export function readExceptionMonitor(path) {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)]
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}

export function instrumentGeneratedMain(profile, output) {
  assertHostedMac()
  const entry = resolve(JSON.parse(readFileSync('package.json', 'utf8')).main)
  const original = readFileSync(entry, 'utf8')
  const observed = withExceptionMonitor(original, join(profile, 'native-exception-monitor.jsonl'))
  writeFileSync(entry, observed)
  const hash = (source) => createHash('sha256').update(source).digest('hex')
  writeJson(join(output, 'p2-build-observer.json'), {
    scope:
      'Only this P2 build output before normal packaging/signing; not production source or release builds.',
    event: 'uncaughtExceptionMonitor',
    behavior: 'Log only; no exception interception or recovery.',
    sourceHash: hash(original),
    observedHash: hash(observed),
    entry
  })
}
