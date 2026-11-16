import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useFocusEffect } from 'expo-router'
import { LocalTaskSessionCard } from './LocalTaskSessionCard'
import { LocalTaskSessionReceipt } from './local-task-session-receipt'
import { LocalTaskSessionLinkSheet, type SessionLinkRequest } from './local-task-session-link-sheet'
import {
  LocalTaskSessionCardSlot,
  LocalTaskSessionReceiptSlot,
  type SessionTaskController,
  type SessionTaskReceiptController
} from './local-task-session-card-slot'

type LinkOpening = { id: number; request: SessionLinkRequest; visible: boolean }

export function LocalTaskSessionCardProvider({ children }: { children: ReactNode }) {
  const [opening, setOpening] = useState<LinkOpening | null>(null)
  const currentOpening = useRef<LinkOpening | null>(null)
  const nextOpeningId = useRef(0)
  const openLinkRequest = useCallback((request: SessionLinkRequest) => {
    const next = { id: ++nextOpeningId.current, request, visible: true }
    currentOpening.current = next
    setOpening(next)
  }, [])
  const closeLinkOpening = useCallback((id: number) => {
    if (currentOpening.current?.id !== id) {
      return
    }
    currentOpening.current = null
    setOpening((current) => (current?.id === id ? { ...current, visible: false } : current))
  }, [])
  useFocusEffect(
    useCallback(
      () => () => {
        currentOpening.current = null
        setOpening(null)
      },
      []
    )
  )
  const renderCard = useCallback(
    (controller: SessionTaskController, onOpenTask: () => void) => (
      <LocalTaskSessionCard
        controller={controller}
        onOpenTask={onOpenTask}
        onLinkSession={openLinkRequest}
      />
    ),
    [openLinkRequest]
  )
  const renderReceipt = useCallback(
    (controller: SessionTaskReceiptController) => (
      <>
        <LocalTaskSessionReceipt controller={controller} />
        {opening ? (
          <LocalTaskSessionLinkSheet
            key={opening.id}
            request={opening.visible ? opening.request : null}
            controller={controller}
            onClose={() => closeLinkOpening(opening.id)}
          />
        ) : null}
      </>
    ),
    [closeLinkOpening, opening]
  )
  return (
    <LocalTaskSessionReceiptSlot.Provider value={renderReceipt}>
      <LocalTaskSessionCardSlot.Provider value={renderCard}>
        {children}
      </LocalTaskSessionCardSlot.Provider>
    </LocalTaskSessionReceiptSlot.Provider>
  )
}
