import { describe, expect, it } from 'vitest'
import { PLUGIN_HOST_API_V0 } from '../../shared/plugins/plugin-host-api'

describe('panel-callable host surface', () => {
  it('storage.get stays readable from panels; storage.set does not', () => {
    const byName = new Map(PLUGIN_HOST_API_V0.map((entry) => [entry.name, entry]))
    expect(byName.get('storage.get')?.panel).toBe(true)
    expect(byName.get('storage.set')?.panel).toBe(false)
    expect(byName.get('storage.delete')?.panel).toBe(false)
  })

  it('every panel-callable method is a read, except the two deliberate writes', () => {
    const panelWrites = PLUGIN_HOST_API_V0.filter((entry) => entry.panel && entry.mutation).map(
      (entry) => entry.name
    )
    expect(panelWrites.sort()).toEqual(['notifications.show', 'terminal.sendText'])
  })
})
