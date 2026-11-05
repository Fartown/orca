import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { callMock, runtimeClientConstructorMock, serveOrcaAppMock, getDefaultUserDataPathMock } =
  vi.hoisted(() => ({
    callMock: vi.fn(),
    runtimeClientConstructorMock: vi.fn(),
    serveOrcaAppMock: vi.fn(),
    getDefaultUserDataPathMock: vi.fn(() => '/tmp/orca-user-data')
  }))

vi.mock('../runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('../index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock
  })
})

import { main } from '../index'
import { okFixture } from '../test-fixtures'

const HOST = { executionHostId: 'local', label: 'mbp5' }
const ID_A = 'Qx3vR0pL8sTy2KmA'
const ID_B = 'Zz9vR0pL8sTy2KmB'

beforeEach(() => {
  callMock.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.stubEnv('ORCA_WORKSPACE_ID', '')
  vi.stubEnv('ORCA_WORKTREE_ID', '')
  vi.stubEnv('ORCA_WORKSPACE_ROOT', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  process.exitCode = 0
})

describe('orca artifacts comments', () => {
  it('asks the computer holding the file for its comments', async () => {
    callMock.mockResolvedValue(okFixture('comments', { host: HOST, comments: [] }))

    await main(['artifacts', 'comments', 'list', 'docs/plan.md', '--json'], '/work/site')

    expect(process.exitCode).not.toBe(1)
    expect(callMock).toHaveBeenCalledWith('artifactShare.comments', {
      executionHostId: 'local',
      sourcePath: resolve('/work/site', 'docs/plan.md')
    })
  })

  it('deletes the listed ids, or every comment with --all, but never both or neither', async () => {
    callMock.mockResolvedValue(
      okFixture('delete', { host: HOST, deletedComments: 2, removedNotes: 1 })
    )

    await main(['artifacts', 'comments', 'delete', 'plan.md', ID_A, ID_B], '/work/site')
    expect(callMock).toHaveBeenLastCalledWith('artifactShare.deleteComments', {
      executionHostId: 'local',
      sourcePath: resolve('/work/site', 'plan.md'),
      commentIds: [ID_A, ID_B]
    })

    await main(['artifacts', 'comments', 'rm', 'plan.md', '--all'], '/work/site')
    expect(callMock).toHaveBeenLastCalledWith('artifactShare.deleteComments', {
      executionHostId: 'local',
      sourcePath: resolve('/work/site', 'plan.md'),
      all: true
    })

    callMock.mockClear()
    await main(['artifacts', 'comments', 'delete', 'plan.md'], '/work/site')
    await main(['artifacts', 'comments', 'delete', 'plan.md', ID_A, '--all'], '/work/site')
    expect(callMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })
})
