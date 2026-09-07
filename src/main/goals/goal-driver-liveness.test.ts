import { describe, expect, it } from 'vitest'
import { inspectGoalDriver } from './goal-driver-liveness'

const goalId = '11111111-1111-4111-8111-111111111111'

describe('inspectGoalDriver', () => {
  it('reads a missing pid as exited', async () => {
    expect(await inspectGoalDriver({ pid: null, goalId, legacyKey: null })).toEqual({
      status: 'exited'
    })
  })

  it('needs the command line to name the goal before it calls the driver live', async () => {
    const live = { status: 'live' as const }
    expect(
      await inspectGoalDriver(
        { pid: 42, goalId, legacyKey: null, platform: 'darwin' },
        {
          inspectLiveness: () => live,
          readCommandLine: async () => `node goal-driver.js --goal-id ${goalId} --run-id x`
        }
      )
    ).toEqual({ status: 'live' })
    expect(
      await inspectGoalDriver(
        { pid: 42, goalId, legacyKey: 'orca-abc', platform: 'darwin' },
        { inspectLiveness: () => live, readCommandLine: async () => 'python3 something-else' }
      )
    ).toEqual({ status: 'exited' })
  })

  it('never lets an empty goalId match an unrelated process at a reused pid', async () => {
    const live = { status: 'live' as const }
    expect(
      await inspectGoalDriver(
        { pid: 42, goalId: '', legacyKey: 'orca-abc', platform: 'darwin' },
        { inspectLiveness: () => live, readCommandLine: async () => 'python3 something-else' }
      )
    ).toEqual({ status: 'exited' })
    expect(
      await inspectGoalDriver(
        { pid: 42, goalId: '', legacyKey: 'orca-abc', platform: 'darwin' },
        {
          inspectLiveness: () => live,
          readCommandLine: async () => 'node orca-goal.mjs start orca-abc'
        }
      )
    ).toEqual({ status: 'live' })
  })

  it('accepts a legacy orca-goal CLI driver holding the workspace key', async () => {
    expect(
      await inspectGoalDriver(
        { pid: 42, goalId, legacyKey: 'orca-abc', platform: 'linux' },
        {
          inspectLiveness: () => ({ status: 'live' }),
          readCommandLine: async () => 'node orca-goal.mjs start --terminal t orca-abc'
        }
      )
    ).toEqual({ status: 'live' })
  })

  it('stays unverifiable when the command line cannot be read', async () => {
    expect(
      await inspectGoalDriver(
        { pid: 42, goalId, legacyKey: null, platform: 'linux' },
        { inspectLiveness: () => ({ status: 'live' }), readCommandLine: async () => undefined }
      )
    ).toMatchObject({ status: 'unverifiable' })
  })

  it('passes through a non-live process verdict', async () => {
    expect(
      await inspectGoalDriver(
        { pid: 42, goalId, legacyKey: null },
        {
          inspectLiveness: () => ({ status: 'unverifiable', reason: 'no access' }),
          readCommandLine: async () => 'irrelevant'
        }
      )
    ).toEqual({ status: 'unverifiable', reason: 'no access' })
  })
})
