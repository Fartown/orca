import { describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ os: 'web' }))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return platform.os
    },
    select: (options: Record<string, unknown>) => options[platform.os]
  },
  StyleSheet: { create: <T>(styles: T) => styles, absoluteFillObject: {} }
}))

describe('full-height task chat drawer clipping', () => {
  it.each([
    ['web', 'clip'],
    ['ios', 'hidden'],
    ['android', 'hidden']
  ])('uses %s overflow value %s', async (os, expected) => {
    platform.os = os
    vi.resetModules()
    const { bottomDrawerStyles } = await import('../components/bottom-drawer/bottom-drawer-styles')
    expect(bottomDrawerStyles.drawerFill.overflow).toBe(expected)
  })
})
