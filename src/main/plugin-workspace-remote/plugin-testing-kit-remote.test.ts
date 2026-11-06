import { describe, expect, it } from 'vitest'

type TestingKit = {
  mockHost(options: { capabilities: string[]; results: Record<string, unknown> }): {
    worker: { call(method: string): Promise<unknown> }
  }
}

const CONTEXT = {
  branch: 'main',
  displayName: 'app',
  terminals: [],
  remote: { name: 'origin', url: 'https://code.example.test/team/app.git' }
}

describe('the testing kit `orca plugin test` ships', () => {
  it('lets a plugin test fake a focused workspace with its remote', async () => {
    const kit: TestingKit = await import(
      new URL('../../../resources/plugins/declarative/orca-testing.mjs', import.meta.url).href
    )
    const host = kit.mockHost({
      capabilities: ['workspace:read'],
      results: { 'workspace.readContext': CONTEXT }
    })
    await expect(host.worker.call('workspace.readContext')).resolves.toEqual(CONTEXT)
  })
})
