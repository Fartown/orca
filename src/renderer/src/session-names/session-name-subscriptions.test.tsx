// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSessionNameIndex } from './session-name-subscriptions'
import { sessionNameStore, type SessionNameRequest } from './session-name-store'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('keeps equivalent request subscriptions and replaces them on identity or path changes', () => {
  const unsubscribe = vi.fn()
  const watch = vi.spyOn(sessionNameStore, 'watch').mockReturnValue({ unsubscribe })
  const request: SessionNameRequest = {
    executionHostId: 'local',
    agent: 'codex',
    sessionId: 'A'
  }
  const hook = renderHook(({ requests }) => useSessionNameIndex(requests), {
    initialProps: { requests: [request] }
  })
  expect(watch).toHaveBeenCalledExactlyOnceWith([request])
  hook.rerender({ requests: [{ ...request }] })
  expect(watch).toHaveBeenCalledTimes(1)
  expect(unsubscribe).not.toHaveBeenCalled()
  for (const next of [
    { ...request, sessionId: 'B' },
    { ...request, executionHostId: 'ssh:other' },
    { ...request, transcriptPath: '/updated/transcript.jsonl' }
  ] satisfies SessionNameRequest[]) {
    const calls = watch.mock.calls.length
    hook.rerender({ requests: [next] })
    expect(watch).toHaveBeenCalledTimes(calls + 1)
    expect(watch).toHaveBeenLastCalledWith([next])
    expect(unsubscribe).toHaveBeenCalledTimes(calls)
  }
  hook.rerender({ requests: [] })
  expect(watch).toHaveBeenLastCalledWith([])
  hook.unmount()
  expect(unsubscribe).toHaveBeenCalledTimes(watch.mock.calls.length)
})
