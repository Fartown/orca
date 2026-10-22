import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const electronBuilderConfig = createRequire(import.meta.url)(
  '../../../config/electron-builder.config.cjs'
)

describe('goal driver resources', () => {
  // Why: main resolves the driver from process.resourcesPath/goal-driver on every
  // platform; a missing mapping silently downgrades Goals to "driver bundle missing".
  it('copies out/goal-driver with the runtime bundles on every platform', () => {
    for (const platform of ['win', 'mac', 'linux']) {
      const entry = (electronBuilderConfig[platform].extraResources ?? []).find(
        (resource: { to: string; from: string }) =>
          String(resource.to).replaceAll('\\', '/') === 'goal-driver'
      )
      expect(entry, `${platform} does not package the goal driver`).toBeDefined()
      expect(String(entry.from).replaceAll('\\', '/')).toBe('out/goal-driver')
    }
  })
})
