import {
  createStructuredAttentionMobileDelivery,
  type StructuredAttentionMobileDelivery,
  type StructuredAttentionMobileDeliveryDeps
} from '../runtime/agent-session/lifecycle/structured-agent-session-mobile-attention'

type SessionTitleReader = NonNullable<StructuredAttentionMobileDeliveryDeps['readSessionTitle']>

/** Structured chat phone notifications carry the host-resolved session or room title. */
export function titledStructuredAttentionDelivery(
  names: { structuredNotificationSessionTitle: SessionTitleReader },
  deps: Omit<StructuredAttentionMobileDeliveryDeps, 'readSessionTitle'>
): StructuredAttentionMobileDelivery {
  return createStructuredAttentionMobileDelivery({
    ...deps,
    readSessionTitle: names.structuredNotificationSessionTitle
  })
}
