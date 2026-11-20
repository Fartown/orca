import { createContext, useContext, type ReactNode } from 'react'
import { ActionSheetModal, type ActionSheetAction } from '../components/sheets/ActionSheetModal'
import { useMobileSessionContinuationScope } from './use-mobile-session-continuation-scope'
import type { MobileSessionTab } from '../session/tabs/mobile-session-tabs'
import { getMobileSessionContinuationActions } from './continuation-actions'

type SessionContinuationActions = (
  terminalHandle: string,
  dismiss: () => void
) => ActionSheetAction[]

type ContinuationSheetScope = Parameters<typeof useMobileSessionContinuationScope>[0] & {
  sessionTabs: MobileSessionTab[]
}

const SessionContinuationActionsContext = createContext<SessionContinuationActions | undefined>(
  undefined
)

function useMobileSessionContinuationSheet(scope: ContinuationSheetScope) {
  const {
    continuationTarget,
    continuationActions,
    continuationTitle,
    continuationMessage,
    openContinuation,
    closeContinuation
  } = useMobileSessionContinuationScope(scope)
  return {
    sessionContinuationActions: (terminalHandle: string, dismiss: () => void) =>
      getMobileSessionContinuationActions({
        terminalHandle,
        tabs: scope.sessionTabs.filter(
          (tab): tab is Extract<MobileSessionTab, { type: 'terminal' }> => tab.type === 'terminal'
        ),
        onDismiss: dismiss,
        onOpen: openContinuation
      }),
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

/** Wraps the session sheets so the terminal long-press menu gets the entry without the hot
 *  sheets file holding continuation state; the picker mounts right after those sheets. */
export function MobileSessionContinuationScope({
  controller,
  children
}: {
  controller: ContinuationSheetScope
  children: ReactNode
}): React.JSX.Element {
  const { sessionContinuationActions, continuationSheet } =
    useMobileSessionContinuationSheet(controller)
  return (
    <SessionContinuationActionsContext.Provider value={sessionContinuationActions}>
      {children}
      {continuationSheet}
    </SessionContinuationActionsContext.Provider>
  )
}

/** Undefined outside a scope, which leaves the long-press menu without the entry. */
export function useMobileSessionContinuationActions(): SessionContinuationActions | undefined {
  return useContext(SessionContinuationActionsContext)
}
