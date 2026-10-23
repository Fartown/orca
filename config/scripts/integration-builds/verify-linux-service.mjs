import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function assertLinuxServiceReplacement({ expectedVersion, before, after }) {
  if (
    after?.ActiveState !== 'active' ||
    after.cli_version !== expectedVersion ||
    after.updater?.appVersion !== expectedVersion ||
    after.web_http_status !== 200
  ) {
    throw new Error('The replacement service is not serving the expected version.')
  }
  const support = after.updater.support
  if (
    support?.automatic !== true ||
    support.installMode !== 'supervised-headless-serve' ||
    support.reason !== 'available'
  ) {
    throw new Error('The replacement service has not enabled supervised automatic updates.')
  }
  if (before?.terminal_daemon_retained && after.terminal_daemon_retained !== true) {
    throw new Error('The existing terminal daemon was lost.')
  }
  if (!Array.isArray(before?.tabs) || !Array.isArray(after.tabs)) {
    throw new Error('The before and after terminal snapshots are required.')
  }
  const previous = new Map(before.tabs.map((tab) => [tab.id, tab]))
  const current = new Map(after.tabs.map((tab) => [tab.id, tab]))
  if (
    previous.size !== before.tabs.length ||
    current.size !== after.tabs.length ||
    previous.size !== current.size ||
    [...previous].some(([id, tab]) => {
      const retained = current.get(id)
      return (
        !id ||
        !retained ||
        retained.ptyId !== tab.ptyId ||
        (tab.ptyId &&
          (typeof tab.incarnationId !== 'string' ||
            tab.incarnationId.length === 0 ||
            retained.incarnationId !== tab.incarnationId)) ||
        (tab.providerSessionId && retained.providerSessionId !== tab.providerSessionId)
      )
    })
  ) {
    throw new Error('An existing terminal identity or provider session could not be verified.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [expectedVersion, beforePath, afterPath] = process.argv.slice(2)
    if (!expectedVersion || !beforePath || !afterPath) {
      throw new Error('Usage: verify-linux-service.mjs VERSION BEFORE.json AFTER.json')
    }
    assertLinuxServiceReplacement({
      expectedVersion,
      before: JSON.parse(readFileSync(beforePath, 'utf8')),
      after: JSON.parse(readFileSync(afterPath, 'utf8'))
    })
    console.info('Linux service version, automatic updates, and terminal retention verified.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Linux service verification failed.')
    process.exitCode = 1
  }
}
