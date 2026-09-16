import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { MethodHandler } from '../../relay/dispatcher-contract'
import { registerRelayGoals } from './goal-relay-service'

let home: string | null = null
let stop: (() => void) | null = null
afterEach(async () => {
  stop?.()
  vi.unstubAllEnvs()
  if (home) {
    await rm(home, { recursive: true, force: true })
  }
})

it('registers the existing Goal API on the relay and leaves its host store separate', async () => {
  home = await mkdtemp(join(tmpdir(), 'goal-relay-'))
  vi.stubEnv('ORCA_GOAL_HOME', home)
  const methods = new Map<string, MethodHandler>()
  const requestClient = vi.fn()
  stop = registerRelayGoals(
    { onRequest: (method, handler) => methods.set(method, handler), requestClient },
    { getStatusSnapshotForPane: () => [] }
  )
  const list = methods.get('goals.listEditorDrafts')!
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Read-only empty-store listing only consumes clientId; transport lifecycle callbacks are not exercised.
  const context = { clientId: 7 } as Parameters<MethodHandler>[1]
  expect(await list({ authorityExecutionHostId: 'ssh:host' }, context)).toEqual({ items: [] })
  expect(methods.has('goals.draftAcceptance')).toBe(true)
  expect(methods.has('goals.create')).toBe(true)
  expect(methods.has('goals.control')).toBe(true)
  expect(methods.has('goals.deleteEditorDraft')).toBe(true)
  expect(requestClient).not.toHaveBeenCalled()
})
