import { expect, it } from 'vitest'
import { normalizeRightSidebarTab } from '../persistence/applying-settings/ui-selection-normalization'

it('keeps the Goals right-sidebar route when persisted UI state is loaded', () => {
  expect(normalizeRightSidebarTab('goals')).toBe('goals')
})
