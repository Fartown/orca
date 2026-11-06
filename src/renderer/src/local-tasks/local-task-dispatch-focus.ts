import { useSyncExternalStore } from 'react'

let request = 0
const listeners = new Set<() => void>()

export function requestLocalTaskDispatchFocus(): void {
  request += 1
  for (const listener of listeners) {
    listener()
  }
}

export function useLocalTaskDispatchFocusRequest(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => request
  )
}
