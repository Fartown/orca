import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalFileSink } from '../observability/local-file-sink'
import { setActiveSink } from '../observability/tracer'
import { recordRendererBreadcrumbFromRenderer } from '../ipc/crash-reporting-renderer-breadcrumbs'
import { launchEvidence } from '../../shared/terminal-launch-diagnostics/launch-evidence'

afterEach(() => {
  setActiveSink(null)
})

describe('renderer launch evidence reaches the host trace file', () => {
  it('flushes both simultaneous origins without coalescing away either one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-renderer-launch-'))
    const filePath = join(dir, 'main.trace.ndjson')
    const sink = createLocalFileSink({ filePath, batchWindowMs: 100_000 })
    setActiveSink(sink)
    try {
      for (const origin of ['automatic-sleeping-resume', 'queued-startup']) {
        recordRendererBreadcrumbFromRenderer({
          name: 'terminal_launch_origin',
          data: {
            origin,
            sourceFrame0: 'launch-origin.ts:1:1',
            ...launchEvidence({
              agent: 'codex',
              providerSession: { id: 'private-session' },
              command: 'private-command',
              env: { AUTH: 'private-secret' }
            })
          }
        })
      }
      const rows = readFileSync(filePath, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(rows).toHaveLength(2)
      expect(rows[0].attributes['breadcrumb.data'].origin).toBe('automatic-sleeping-resume')
      expect(rows[1].attributes['breadcrumb.data'].origin).toBe('queued-startup')
      expect(rows[0].attributes['breadcrumb.data'].providerRef).toBe(
        rows[1].attributes['breadcrumb.data'].providerRef
      )
      expect(rows[0].attributes['breadcrumb.data'].sourceFrame0).toMatch(/\.(?:ts|js):\d+:\d+$/)
      expect(readFileSync(filePath, 'utf8')).not.toMatch(
        /private-command|private-session|private-secret/
      )
    } finally {
      sink.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
