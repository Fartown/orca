import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import type { LocalTaskProgressSnapshot } from '../../../src/shared/local-tasks/local-task-link-types'
import type { RpcClient } from '../transport/rpc-client'
import { createLocalTasksApi } from './local-tasks-api'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { localTaskItemsSeenInSession } from './local-task-progress-projection'

/**
 * Whether the session screen is the one shown in its stack. Read from focus events rather than
 * `useIsFocused`: in the page document the host stack is a custom navigator that gives its screens
 * no focused-route context, so `useIsFocused` reads false there even on the screen in view.
 */
function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(false)
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, [])
  )
  return focused
}

function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState === 'active')
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active')
    })
    return () => subscription.remove()
  }, [])
  return active
}

/**
 * When this session came into view, null while it is out of view. Each session tab is its own
 * stretch: switching tabs on the same screen starts a new one, as does coming back to the screen
 * (a screen pushed over it leaves it mounted but unfocused) or to the app.
 */
function useSessionVisibleSince(taskSessionId: string | null): number | null {
  const focused = useScreenFocused()
  const active = useAppActive()
  const visible = focused && active && taskSessionId !== null
  const [stretch, setStretch] = useState<{ taskSessionId: string; since: number } | null>(null)
  useEffect(() => {
    setStretch(visible && taskSessionId ? { taskSessionId, since: Date.now() } : null)
  }, [visible, taskSessionId])
  return visible && stretch?.taskSessionId === taskSessionId ? stretch.since : null
}

/**
 * Looking at a linked session is seeing it: the "Needs you" items it already held when it came
 * into view are marked seen on the library's host, once per item (技术方案 §9.2).
 */
export function useAcknowledgeOpenSession(
  client: RpcClient | null,
  taskSessionId: string | null,
  progress: LocalTaskProgressSnapshot | null
): void {
  const visibleSince = useSessionVisibleSince(taskSessionId)
  const acknowledged = useRef(new Set<string>())
  useEffect(() => {
    if (!client || !taskSessionId || visibleSince === null) {
      return
    }
    const api = createLocalTasksApi(client)
    for (const item of localTaskItemsSeenInSession(progress, taskSessionId, visibleSince)) {
      if (!acknowledged.current.has(item.key)) {
        acknowledged.current.add(item.key)
        void sendLocalTaskWrite(
          createLocalTaskOperationIds(),
          { itemKey: item.key, taskSessionId: item.taskSessionId },
          api.acknowledge
        )
      }
    }
  }, [client, taskSessionId, progress, visibleSince])
}
