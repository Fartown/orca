import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebRuntimeSessionTerminalResult } from './paired-terminal-launch'

const mocked = vi.hoisted(() => ({ create: vi.fn(), record: vi.fn(), state: { settings: {} } }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocked.state } }))
vi.mock('../runtime/web-runtime-terminal-create-operation', () => ({
  createWebRuntimeSessionTerminalResult: mocked.create
}))
vi.mock('./launch-origin', () => ({ recordTerminalLaunchOrigin: mocked.record }))

beforeEach(() => vi.clearAllMocks())

describe('paired terminal launch diagnostic seam', () => {
  it('records origin then returns the existing operation promise without changing its arguments', async () => {
    const args = { worktreeId: 'remote-workspace', environmentId: 'paired-host' }
    const result = { outcome: { status: 'created' } }
    const pending = Promise.resolve(result)
    mocked.create.mockReturnValue(pending)
    expect(createWebRuntimeSessionTerminalResult(args)).toBe(pending)
    expect(mocked.record).toHaveBeenCalledWith('paired-terminal-create', args, mocked.state)
    expect(mocked.record.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.create.mock.invocationCallOrder[0]
    )
    expect(mocked.create).toHaveBeenCalledExactlyOnceWith(args)
    await expect(pending).resolves.toBe(result)
  })

  it('preserves a rejected host call without retrying or falling back', async () => {
    const error = new Error('host unavailable')
    mocked.create.mockRejectedValue(error)
    await expect(
      createWebRuntimeSessionTerminalResult({ worktreeId: 'remote-workspace' })
    ).rejects.toBe(error)
    expect(mocked.create).toHaveBeenCalledOnce()
  })
})
