import { ActionSheetModal } from '../components/ActionSheetModal'
import { useMobileSessionContinuationScope } from './use-mobile-session-continuation-scope'

/** The continuation sheet plus its opener, so the session sheet file carries one line for this
 *  feature instead of a scope binding and a modal it does not otherwise know about. */
export function useMobileSessionContinuationSheet(
  scope: Parameters<typeof useMobileSessionContinuationScope>[0]
): { openContinuation: () => void; continuationSheet: React.JSX.Element } {
  const {
    continuationTarget,
    continuationActions,
    continuationTitle,
    continuationMessage,
    openContinuation,
    closeContinuation
  } = useMobileSessionContinuationScope(scope)
  return {
    openContinuation,
    continuationSheet: (
      <ActionSheetModal
        visible={continuationTarget != null}
        title={continuationTitle}
        message={continuationMessage}
        actions={continuationActions}
        onClose={closeContinuation}
      />
    )
  }
}
