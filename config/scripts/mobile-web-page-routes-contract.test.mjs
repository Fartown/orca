import { describe, expect, it } from 'vitest'
import { MobileWebBundleRouteSchema } from '../../src/shared/mobile-web-bundle/manifest-contract'
import { MOBILE_WEB_PAGE_ROUTES } from './mobile-web-page-routes.mjs'

// The host refuses a manifest whole when one route breaks the contract, which sends every page back
// to its native screen; the bundle verifier passed a route over the grant ceiling without a word.
describe('mobile web page routes', () => {
  it('each satisfy the manifest route contract, grant ceiling included', () => {
    for (const route of MOBILE_WEB_PAGE_ROUTES) {
      const parsed = MobileWebBundleRouteSchema.safeParse(route)
      const issues = parsed.success
        ? ''
        : parsed.error.issues.map((issue) => issue.message).join('; ')
      expect(parsed.success, `${route.pathname}: ${issues}`).toBe(true)
    }
  })
})
