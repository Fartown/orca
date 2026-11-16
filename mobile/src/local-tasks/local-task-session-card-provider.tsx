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

export function LocalTaskSessionCardProvider({ children }: { children: ReactNode }) {
  const [linkRequest, setLinkRequest] = useState<SessionLinkRequest | null>(null)
  const currentRequest = useRef<SessionLinkRequest | null>(null)
  const openLinkRequest = useCallback((request: SessionLinkRequest) => {
    currentRequest.current = request
    setLinkRequest(request)
  }, [])
  const closeLinkRequest = useCallback((request: SessionLinkRequest) => {
    if (currentRequest.current !== request) {
      return
    }
    currentRequest.current = null
    setLinkRequest((current) => (current === request ? null : current))
  }, [])
  useFocusEffect(
    useCallback(
      () => () => {
        currentRequest.current = null
        setLinkRequest(null)
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
        <LocalTaskSessionLinkSheet
          request={linkRequest}
          controller={controller}
          onClose={closeLinkRequest}
        />
      </>
    ),
    [closeLinkRequest, linkRequest]
  )
  return (
    <LocalTaskSessionReceiptSlot.Provider value={renderReceipt}>
      <LocalTaskSessionCardSlot.Provider value={renderCard}>
        {children}
      </LocalTaskSessionCardSlot.Provider>
    </LocalTaskSessionReceiptSlot.Provider>
  )
}
