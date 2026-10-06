/**
 * Which page routes attach a file through the shell's named picker, and the grant that needs.
 *
 * `native.file.pick` is reached through `useFileAttachmentPicker`, whose web sibling reads
 * `init.grants.native` at pick time and falls back to `native.media.pick` without it; that fallback
 * is why the grant sits on the optional lane and why a route that forgot it would still render,
 * just with typed names and the image ceiling. This census is what notices the forgetting.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mobileWebAppRouteClosure } from './build-mobile-web-app-bundle.mjs'
import { mobileWebAppDependenciesPresent } from './mobile-web-app-bundle-dependencies.mjs'
import { PAGE_ROUTE_MODULES } from './mobile-web-app-page-route-modules.mjs'
import { MOBILE_WEB_PAGE_ROUTES } from './mobile-web-page-routes.mjs'

const mobileDir = fileURLToPath(new URL('../../mobile/', import.meta.url))
const describeClosure = mobileWebAppDependenciesPresent() ? describe : describe.skip

const SESSION = '/h/[hostId]/session/[worktreeId]'
const SEAM = 'src/file-attachment-upload/file-attachment-picker.web.ts'
const NATIVE = 'src/file-attachment-upload/file-attachment-picker.ts'
const GRANT_MODULE = 'src/file-attachment-upload/bridge-file-verbs.ts'

/** The verb, parsed off its own declaration: a second spelling is one that can drift. */
function filePickGrantToken() {
  const source = readFileSync(join(mobileDir, GRANT_MODULE), 'utf8')
  const declared = /BRIDGE_FILE_VERB_NAMES = \['([^']+)'\]/.exec(source)
  if (declared === null) {
    throw new Error(`${GRANT_MODULE} no longer declares the verb this census reads`)
  }
  return declared[1]
}

function routesDeclaring(token) {
  return MOBILE_WEB_PAGE_ROUTES.filter(
    (route) => route.grants.includes(token) || (route.optionalGrants ?? []).includes(token)
  ).map((route) => route.pathname)
}

describe('the grant token this census is written against', () => {
  it('is the one the shell declares', () => {
    expect(filePickGrantToken()).toBe('native.file.pick')
  })
})

describeClosure(
  'the routes that attach a file',
  () => {
    it('declares the named picker on exactly the routes whose closure reaches it', async () => {
      const reaching = []
      for (const [route, mod] of PAGE_ROUTE_MODULES) {
        const closure = await mobileWebAppRouteClosure(mod)
        if (closure.local.includes(SEAM)) {
          reaching.push(route)
        }
      }
      expect(reaching).toEqual([SESSION])
      expect(routesDeclaring(filePickGrantToken()).sort()).toEqual([...reaching].sort())
    })

    it('declares it on the optional lane, so a shell without it keeps the screen on the page', () => {
      const session = MOBILE_WEB_PAGE_ROUTES.find((route) => route.pathname === SESSION)
      if (!session) {
        throw new Error('the manifest lost the session route this census is written against')
      }
      expect(session.optionalGrants).toContain(filePickGrantToken())
      expect(session.grants).not.toContain(filePickGrantToken())
      // Its handles are read and released through the media verbs, which the route requires.
      expect(session.grants).toEqual(
        expect.arrayContaining(['native.media.read', 'native.media.release'])
      )
    })

    it('reaches the picker through its web sibling, never the native document picker', async () => {
      const closure = await mobileWebAppRouteClosure(PAGE_ROUTE_MODULES.get(SESSION))
      expect(closure.local).toContain(SEAM)
      expect(closure.local).not.toContain(NATIVE)
    })
  },
  240_000
)
