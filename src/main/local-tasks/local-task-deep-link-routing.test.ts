import { expect, it, vi } from 'vitest'
import {
  localTaskDeepLink,
  localTaskDeepLinkFromArguments
} from '../../shared/local-tasks/local-task-deep-link'
import { isRoutedOrcaDeepLink } from '../startup/open-routing/orca-deep-link-url'
import { PendingDeepLinkState } from '../startup/open-routing/skill-share-deep-link-state'
import { desktopHandoffArguments } from '../window/activation/macos-desktop-handoff'

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
      deepLinks: { drainArguments: () => [] },
      pluginInstallLinks: { consume: () => null },
      osOpenedDocuments: { consume: () => [] }
    })
  ).toContain(link)
})

it('routes a malformed task URL to its owner without capturing unrelated Orca URLs', () => {
  const malformed = 'orca://tasks/v1/local/a%2Fb'
  const unrelated = 'orca://pair?code=x'
  expect(isRoutedOrcaDeepLink(malformed)).toBe(true)
  expect(isRoutedOrcaDeepLink(unrelated)).toBe(false)

  const pending = new PendingDeepLinkState(localTaskDeepLinkFromArguments)
  const publish = vi.fn()
  expect(pending.capture(['Orca', unrelated], publish)).toBe(false)
  expect(pending.capture(['Orca', malformed], publish)).toBe(true)
  expect(publish).toHaveBeenCalledExactlyOnceWith(malformed)
  expect(pending.consume()).toBe(malformed)
})
