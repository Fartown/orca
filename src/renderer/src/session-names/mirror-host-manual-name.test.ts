import { expect, it } from 'vitest'
import { mirrorHostManualName } from './mirror-host-manual-name'
import { resolveTerminalTabTitle } from '../../../shared/tab-title-resolution'

const slot = { agent: 'codex', sessionId: 's-1', title: 'Cached generated name' } as const

it('uses the host manual fallback without promoting it above confirmed Provider evidence', () => {
  const manual = mirrorHostManualName(slot, 'Host manual name')
  expect(
    resolveTerminalTabTitle({ title: '', customTitle: null, aiVaultTitle: manual }, true)
  ).toBe('Host manual name')
  const native = mirrorHostManualName(
    { ...slot, providerName: { kind: 'named', title: 'Provider name', field: 'test.nativeName' } },
    'Host manual name'
  )
  expect(
    resolveTerminalTabTitle({ title: '', customTitle: null, aiVaultTitle: native }, true)
  ).toBe('Provider name')
})

it('preserves old-peer evidence on omission and clears a manual name on explicit null', () => {
  const manual = { ...slot, manualTitle: 'Old name' }
  expect(mirrorHostManualName(manual, undefined)).toBe(manual)
  expect(mirrorHostManualName(manual, null)).toEqual({ ...slot, manualTitle: null })
})
