import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalProcessInspection as RuntimeTerminalProcessInspection } from '../../../../shared/terminal/pty/lifecycle/terminal-process-inspection'
import { clientOnlyUnverifiableInspection } from '../../../../shared/terminal/pty/lifecycle/terminal-process-inspection'
import { createPaneForegroundAgentTracker } from './pty-connection/agent-identity/foreground-process/pane-foreground-agent-tracker'

const PTY = 'remote:env@@term'
function live(epoch = 1): RuntimeTerminalProcessInspection {
  return {
    foregroundProcess: 'claude',
    hasChildProcesses: true,
    foregroundProcessEvidence: {
      verdict: 'live',
      processName: 'claude',
      ptyId: 'term',
      ptyIncarnationId: 'inc',
      authorityGeneration: 'authority',
      observationEpoch: epoch,
      capturedAgeMs: 0,
      fence: {
        platform: 'posix',
        shellPid: 1,
        shellStartTime: '1',
        tty: '/dev/pts/1',
        foregroundPgid: 2
      }
    }
  }
}

function fixture(initialContact: string | null = 'connected', remote = true) {
  let key = initialContact
  let changed = () => {}
  const read = vi.fn<() => Promise<RuntimeTerminalProcessInspection>>().mockResolvedValue(live())
  const publish = vi.fn()
  const shell = vi.fn()
  const unsubscribe = vi.fn()
  const subscribe = vi.fn((listener: () => void) => {
    changed = listener
    return unsubscribe
  })
  const tracker = createPaneForegroundAgentTracker({
    getPtyId: () => PTY,
    isTrackablePtyId: () => true,
    isRemotePtyId: () => remote,
    getExpectedIncarnationId: () => 'inc',
    getReadContactKey: () => key,
    subscribeReadContactChange: subscribe,
    readForegroundProcess: read,
    publish,
    hasKnownAgentIdentity: () => true,
    onConfirmedShellForeground: shell
  })
  return {
    tracker,
    read,
    publish,
    shell,
    unsubscribe,
    subscribe,
    contact: (next: string | null) => {
      key = next
      changed()
    }
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('foreground reads follow shared host contact', () => {
  it('never subscribes native local panes to remote contact changes', async () => {
    const first = fixture('connected', false)
    const second = fixture('connected', false)
    first.tracker.onCommandStarted('claude')
    second.tracker.onVisiblePtyBound(true)
    await vi.advanceTimersByTimeAsync(350)
    expect(first.subscribe).not.toHaveBeenCalled()
    expect(second.subscribe).not.toHaveBeenCalled()
    expect(first.read).toHaveBeenCalledOnce()
    expect(second.read).toHaveBeenCalledOnce()
    first.tracker.dispose()
    second.tracker.dispose()
  })

  it('subscribes a remote pane only when its first foreground read is requested', () => {
    const f = fixture()
    expect(f.subscribe).not.toHaveBeenCalled()
    f.tracker.onCommandStarted('claude')
    expect(f.subscribe).toHaveBeenCalledOnce()
    f.tracker.dispose()
  })
  it('cancels a scheduled read and only reads again on the shared return to contact', async () => {
    const f = fixture()
    f.tracker.onCommandFinished()
    f.contact(null)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(f.read).not.toHaveBeenCalled()
    expect(f.publish).not.toHaveBeenCalled()
    expect(f.shell).not.toHaveBeenCalled()
    f.contact('connected')
    await vi.advanceTimersByTimeAsync(0)
    expect(f.read).toHaveBeenCalledTimes(1)
    expect(f.publish).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'claude', routingTrusted: true })
    )
    f.tracker.dispose()
  })

  it('does not arm a timer for new command events while the host is out of contact', async () => {
    const f = fixture(null)
    f.tracker.onCommandStarted('claude')
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(f.read).not.toHaveBeenCalled()
    f.contact('connected')
    await vi.advanceTimersByTimeAsync(0)
    expect(f.read).toHaveBeenCalledTimes(1)
    f.tracker.dispose()
  })

  it('drops an in-flight pre-disconnect reply after a same-key return', async () => {
    const f = fixture()
    const old = Promise.withResolvers<RuntimeTerminalProcessInspection>()
    f.read.mockReturnValueOnce(old.promise).mockResolvedValue(live(2))
    f.tracker.onVisiblePtyBound(true)
    await vi.advanceTimersByTimeAsync(350)
    f.contact(null)
    f.contact('connected')
    await vi.advanceTimersByTimeAsync(0)
    expect(f.publish).toHaveBeenCalledTimes(1)
    old.resolve(live(1))
    await vi.advanceTimersByTimeAsync(0)
    expect(f.publish).toHaveBeenCalledTimes(1)
    expect(f.shell).not.toHaveBeenCalled()
    f.tracker.dispose()
  })

  it('does not retry an unverifiable remote read or turn it into shell evidence', async () => {
    const f = fixture()
    f.read.mockResolvedValue(clientOnlyUnverifiableInspection('transport_loss'))
    f.tracker.onCommandFinished()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(f.read).toHaveBeenCalledTimes(1)
    expect(f.publish).not.toHaveBeenCalled()
    expect(f.shell).not.toHaveBeenCalled()
    f.tracker.dispose()
  })

  it('disposes its contact subscription and never resumes a disposed tracker', async () => {
    const f = fixture(null)
    f.tracker.onCommandStarted('claude')
    f.tracker.dispose()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
    f.contact('connected')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(f.read).not.toHaveBeenCalled()
  })

  it('keeps a legacy remote process hint unverifiable without privately retrying it', async () => {
    const read = vi.fn(async () => 'claude')
    const publish = vi.fn()
    const tracker = createPaneForegroundAgentTracker({
      getPtyId: () => 'ssh:connection@@pty-delayed',
      isTrackablePtyId: () => true,
      isRemotePtyId: () => true,
      getExpectedIncarnationId: () => 'inc-current',
      readForegroundProcess: read,
      confirmForegroundProcess: read,
      publish
    })
    tracker.onAgentStartupObserved()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('ssh:connection@@pty-delayed', {
      expectedIncarnationId: 'inc-current'
    })
    expect(publish).not.toHaveBeenCalled()
    tracker.onCommandStarted()
    await vi.advanceTimersByTimeAsync(350)
    expect(read).toHaveBeenCalledTimes(2)
    expect(publish).not.toHaveBeenCalled()
    tracker.dispose()
  })
})
