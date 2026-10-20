import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('terminal launch coverage contract', () => {
  it.each([
    ['src/main/runtime/rpc/dispatcher.ts', 'traceTerminalLaunchRpc'],
    ['src/main/ipc/pty/runtime/spawn.ts', 'traceTerminalPtyAdmission'],
    ['src/main/ipc/pty/runtime/spawn-execute.ts', 'recordTerminalProviderDispatch'],
    ['src/main/daemon/daemon-terminal-admission.ts', 'traceDaemonTerminalLaunch'],
    ['src/renderer/src/store/terminals/terminal-tab-creation.ts', 'renderer-tab-created'],
    ['src/renderer/src/store/terminals/terminal-startup-queues.ts', 'queued-startup'],
    [
      'src/renderer/src/runtime/web-runtime-terminal-creation.ts',
      'terminal-launch-diagnostics/paired-terminal-launch'
    ],
    ['src/renderer/src/lib/sleeping-agent-session-launch.ts', 'automatic-sleeping-resume'],
    [
      'src/renderer/src/components/terminal-pane/pty-connection/deferred-cold-restore-and-snapshot.ts',
      'cold-restore-resume'
    ],
    [
      'src/renderer/src/hooks/ipc-events/terminal-request-ipc-bridge.ts',
      'runtime-tab-create-request'
    ],
    ['src/main/observability/index.ts', 'diagnostics-ready']
  ])('keeps %s connected to the diagnostic lane', (path, marker) => {
    expect(readFileSync(resolve(path), 'utf8')).toContain(marker)
  })
})
