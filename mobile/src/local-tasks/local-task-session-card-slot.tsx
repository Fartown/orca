import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { spacing } from '../theme/mobile-theme'
import type { LocalTaskSessionCard } from './LocalTaskSessionCard'
import type { MobileSessionTab } from '../session/tabs/mobile-session-tabs'
import type { ConnectionState } from '../transport/connection/connection-state'

export type SessionTaskController = ComponentProps<typeof LocalTaskSessionCard>['controller']
export type SessionTaskReceiptController = SessionTaskController & {
  connState: ConnectionState
  terminalsLoaded: boolean
  visibleTabs: readonly MobileSessionTab[]
}

type RenderReceipt = (controller: SessionTaskReceiptController) => ReactNode
type RenderCard = (controller: SessionTaskController, onOpenTask: () => void) => ReactNode

/** The session route owns the task graph; upstream chrome consumes only these slots. */
export const LocalTaskSessionReceiptSlot = createContext<RenderReceipt | null>(null)
export const LocalTaskSessionCardSlot = createContext<RenderCard | null>(null)

export function LocalTaskSessionReceiptMount({
  controller
}: {
  controller: SessionTaskReceiptController
}) {
  return useContext(LocalTaskSessionReceiptSlot)?.(controller) ?? null
}

export function LocalTaskSessionCardMount({
  controller,
  onOpenTask,
  children
}: {
  controller: SessionTaskController
  onOpenTask: () => void
  children?: ReactNode
}) {
  const renderCard = useContext(LocalTaskSessionCardSlot)
  if (!renderCard) {
    return children ?? null
  }
  return (
    <View style={styles.column}>
      <View style={styles.meta}>{children}</View>
      {renderCard(controller, onOpenTask)}
    </View>
  )
}

const styles = StyleSheet.create({
  column: { width: '100%', gap: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }
})
