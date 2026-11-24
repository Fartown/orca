import type { PreloadApi } from '../../../../preload/api-types'
import { noopUnsubscribe } from './web-storage'

/** Browser clients receive no desktop OS task links; upstream's WEB_PENDING_LINK_API covers the rest. */
export const webOsDeepLinkApi = {
  onOpenLocalTaskLink: () => noopUnsubscribe,
  consumePendingLocalTaskLink: () => Promise.resolve(null)
} satisfies Pick<PreloadApi['ui'], 'onOpenLocalTaskLink' | 'consumePendingLocalTaskLink'>
