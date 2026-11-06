import { isOrcaWindowForegroundFocused } from '@/components/terminal-pane/terminal-notification-pane-visibility'

export function localTaskSessionPanelIsOnScreen(element: HTMLElement | null): boolean {
  if (!element || !isOrcaWindowForegroundFocused()) {
    return false
  }
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return false
  }
  const x = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2))
  const y = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2))
  const top = document.elementFromPoint(x, y)
  return top !== null && element.contains(top)
}
