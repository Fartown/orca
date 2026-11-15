import type { PreloadApi } from '../../../../preload/api-types'
import { noopUnsubscribe } from './web-storage'

/** Browser clients receive no desktop OS URL events or queued launch arguments. */
export const webOsDeepLinkApi = {
  onOpenSkillShare: () => noopUnsubscribe,
  consumePendingSkillShare: () => Promise.resolve(null),
  onOpenLocalTaskLink: () => noopUnsubscribe,
  consumePendingLocalTaskLink: () => Promise.resolve(null),
  onOpenPluginInstallLink: () => noopUnsubscribe,
  consumePendingPluginInstallLink: () => Promise.resolve(null)
} satisfies Pick<
  PreloadApi['ui'],
  | 'onOpenSkillShare'
  | 'consumePendingSkillShare'
  | 'onOpenLocalTaskLink'
  | 'consumePendingLocalTaskLink'
  | 'onOpenPluginInstallLink'
  | 'consumePendingPluginInstallLink'
>
