import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('terminal launch coverage contract', () => {
  it.each([
    ['src/main/runtime/rpc/dispatcher.ts', 'traceTerminalLaunchRpc'],
    ['src/main/ipc/pty/runtime/spawn.ts', 'traceTerminalPtyAdmission'],
    ['src/main/ipc/pty/spawn/spawn-execute.ts', 'recordTerminalProviderDispatch'],
    ['src/main/daemon/server/daemon-terminal-admission.ts', 'traceDaemonTerminalLaunch'],
    [
      'src/renderer/src/store/terminals/tabs/creation/terminal-tab-creation.ts',
      'recordCreatedTerminalTab'
    ],
    [
      'src/renderer/src/lib/agent-session/resume/history/launch-ai-vault-session-and-reveal.ts',
      'terminal-launch-diagnostics/history-session-launch'
    ],
    ['src/renderer/src/store/terminals/tabs/creation/terminal-startup-queues.ts', 'queued-startup'],
    [
      'src/renderer/src/runtime/hosted-terminals/creation/web-runtime-terminal-creation.ts',
      'terminal-launch-diagnostics/paired-terminal-launch'
    ],
    [
      'src/renderer/src/lib/agent-session/launch/new-tab/launch-agent-web-host-tab.ts',
      'terminal-launch-diagnostics/paired-terminal-launch'
    ],
    [
      'src/renderer/src/lib/agent-session/resume/sleeping-agent-session-launch.ts',
      'automatic-sleeping-resume'
    ],
    [
      'src/renderer/src/components/terminal-pane/pty-connection/deferred-cold-restore-and-snapshot.ts',
      'recordColdRestoreResumeOrigin'
    ],
    [
      'src/renderer/src/hooks/ipc-events/terminal/terminal-request-ipc-bridge.ts',
      'runtime-tab-create-request'
    ],
    ['src/main/observability/index.ts', 'diagnostics-ready']
  ])('keeps %s connected to the diagnostic lane', (path, marker) => {
    expect(readFileSync(resolve(path), 'utf8')).toContain(marker)
  })
})
