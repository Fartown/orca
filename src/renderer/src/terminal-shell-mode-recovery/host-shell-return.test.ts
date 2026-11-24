import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPaneForegroundAgentTracker } from '@/components/terminal-pane/pty-connection/agent-identity/foreground-process/pane-foreground-agent-tracker'
import type { TerminalForegroundObservation } from '../../../shared/terminal/pty/lifecycle/terminal-foreground-observation'
import type { HostProcessInspection } from '../../../shared/terminal/pty/lifecycle/terminal-process-inspection'

function observation(
  patch: Partial<TerminalForegroundObservation> = {}
): TerminalForegroundObservation {
  return {
    verdict: 'observed',
    source: 'pty-master',
    foregroundKind: 'shell',
    processName: null,
    ptyId: 'term',
    ptyIncarnationId: 'inc',
    authorityGeneration: 'host',
    observationEpoch: 1,
    capturedAgeMs: 0,
    ...patch
  } as TerminalForegroundObservation
}

function fixture(kind: 'local' | 'paired' | 'ssh', answer: HostProcessInspection) {
  const ptyId = kind === 'paired' ? 'remote:env@@term' : kind === 'ssh' ? 'ssh:conn@@term' : 'term'
  const read = vi.fn().mockResolvedValue(answer)
  const reset = vi.fn()
  const publish = vi.fn()
  const tracker = createPaneForegroundAgentTracker({
    getPtyId: () => ptyId,
    getExpectedIncarnationId: () => 'inc',
    isTrackablePtyId: () => true,
    isRemotePtyId: () => kind !== 'local',
    readForegroundProcess: read,
    confirmForegroundProcess: read,
    hasKnownAgentIdentity: () => true,
    publish,
    onConfirmedShellForeground: reset
  })
  return { tracker, reset, read, publish }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('host shell observations reach terminal mode recovery', () => {
  for (const kind of ['local', 'paired', 'ssh'] as const) {
    it.each(['visible', 'finished'] as const)(
      `${kind}: resets on a namedless shell observation at %s`,
      async (reason) => {
        const f = fixture(kind, {
          foregroundProcess: null,
          hasChildProcesses: false,
          foregroundObservation: observation()
        })
        if (reason === 'visible') {
          f.tracker.onVisiblePtyBound(true)
        } else {
          f.tracker.onCommandFinished()
        }
        await vi.advanceTimersByTimeAsync(350)
        expect(f.read).toHaveBeenCalledOnce()
        expect(f.reset).toHaveBeenCalledExactlyOnceWith(
          reason === 'visible' ? 'visible-pty' : 'command-finished'
        )
        expect(f.publish).toHaveBeenLastCalledWith({ agent: null, shellForeground: true })
        f.tracker.dispose()
      }
    )
  }

  it('does not ground a still-starting command from a provisional shell sample', async () => {
    const f = fixture('paired', {
      foregroundProcess: null,
      hasChildProcesses: false,
      foregroundObservation: observation()
    })
    f.tracker.onCommandStarted('claude')
    await vi.advanceTimersByTimeAsync(350)
    expect(f.reset).not.toHaveBeenCalled()
    f.tracker.dispose()
  })

  it('retains TUI modes when host says non-shell even if its process is a shell interpreter', async () => {
    const f = fixture('ssh', {
      foregroundProcess: 'zsh',
      hasChildProcesses: true,
      foregroundObservation: observation({ foregroundKind: 'non-shell', processName: 'zsh' })
    })
    f.tracker.onVisiblePtyBound(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.reset).not.toHaveBeenCalled()
    f.tracker.dispose()
  })

  it.each([
    { ptyId: 'other' },
    { ptyIncarnationId: 'old' },
    { capturedAgeMs: 3000 },
    { verdict: 'unverifiable', reason: 'transport_loss' }
  ])('does not reset from invalid or unverifiable observation %j', async (patch) => {
    const f = fixture('paired', {
      foregroundProcess: 'zsh',
      hasChildProcesses: false,
      foregroundObservation: observation(patch as Partial<TerminalForegroundObservation>)
    })
    f.tracker.onCommandFinished()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.reset).not.toHaveBeenCalled()
    f.tracker.dispose()
  })

  it('does not turn an old host null name into shell proof', async () => {
    const f = fixture('paired', { foregroundProcess: null, hasChildProcesses: false })
    f.tracker.onCommandFinished()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.reset).not.toHaveBeenCalled()
    f.tracker.dispose()
  })
})
