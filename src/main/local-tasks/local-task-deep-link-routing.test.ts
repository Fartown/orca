import { expect, it, vi } from 'vitest'
import {
  localTaskDeepLink,
  localTaskDeepLinkFromArguments
} from '../../shared/local-tasks/local-task-deep-link'
import { isRoutedOrcaDeepLink } from '../startup/orca-deep-link-url'
import { PendingDeepLinkState } from '../startup/skill-share-deep-link-state'
import { desktopHandoffArguments } from '../window/macos-desktop-handoff'

it('routes an OS task link through capture, cold-start consume and sidecar handoff', () => {
  const link = localTaskDeepLink({ endpoint: 'runtime:env-1', taskId: 'task-1' })
  expect(isRoutedOrcaDeepLink(link)).toBe(true)
  const pending = new PendingDeepLinkState(localTaskDeepLinkFromArguments)
  const publish = vi.fn()
  expect(pending.capture(['Orca', link], publish)).toBe(true)
  expect(publish).toHaveBeenCalledWith(link)
  expect(pending.consume()).toBe(link)
  expect(pending.consume()).toBeNull()

  const sidecar = new PendingDeepLinkState(localTaskDeepLinkFromArguments)
  sidecar.capture(['Orca', link])
  expect(
    desktopHandoffArguments({
      localTaskDeepLinks: sidecar,
      skillShareDeepLinks: { consume: () => null },
      pluginInstallLinks: { consume: () => null },
      osOpenedDocuments: { consume: () => [] }
    })
  ).toContain(link)
})
