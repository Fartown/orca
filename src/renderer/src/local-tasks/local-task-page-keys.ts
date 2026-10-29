import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'

/** Single-key commands on the local task page (REQ-007, slice 1). */
export type LocalTaskPageKeyAction =
  | 'create'
  | 'next'
  | 'previous'
  | 'open'
  | 'preview'
  | 'select'
  | 'status'
  | 'priority'
  | 'labels'
  | 'toggle-layout'
  | 'filter'
  | 'search'
  | 'acknowledge'
  | 'snooze'
  | 'start-work'
  | 'open-session'

const KEY_ACTIONS: Readonly<Record<string, LocalTaskPageKeyAction>> = {
  c: 'create',
  j: 'next',
  k: 'previous',
  Enter: 'open',
  ' ': 'preview',
  x: 'select',
  s: 'status',
  p: 'priority',
  l: 'labels',
  v: 'toggle-layout',
  f: 'filter',
  '/': 'search',
  e: 'acknowledge',
  h: 'snooze',
  i: 'start-work',
  a: 'open-session'
}

// The upstream task page leaves Esc to these surfaces; so does this router.
const NESTED_OVERLAY_SELECTOR =
  '[data-slot="dropdown-menu-content"], [data-slot="popover-content"], [data-slot="select-content"], [role="menu"]'
export const LOCAL_TASK_OVERLAY_ATTRIBUTE = 'data-local-task-overlay'
export const LOCAL_TASK_PAGE_ATTRIBUTE = 'data-local-task-page'
export const LOCAL_TASK_ROW_ATTRIBUTE = 'data-local-task-row'
const ACTIVATING_TARGET_SELECTOR =
  'button, a[href], summary, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"]'

export function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  )
}

// Why: focus elsewhere in the window (sidebar, a pane) keeps its own keys.
function isOnLocalTaskPage(target: EventTarget | null): boolean {
  if (target === document.body || target === document.documentElement || target === null) {
    return true
  }
  return target instanceof Element && target.closest(`[${LOCAL_TASK_PAGE_ATTRIBUTE}]`) !== null
}

/** Maps a keydown to a page command, or null when the key belongs to whatever has focus. */
export function resolveLocalTaskPageKey(event: KeyboardEvent): LocalTaskPageKeyAction | null {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    isImeOwnedKeyboardEvent(event)
  ) {
    return null
  }
  const target = event.target
  if (isEditableKeyTarget(target) || !isOnLocalTaskPage(target)) {
    return null
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const action = KEY_ACTIONS[key] ?? null
  // Why: Enter and Space on a focused control press that control, unless it is a task row.
  const control = target instanceof Element ? target.closest(ACTIVATING_TARGET_SELECTOR) : null
  if (
    (action === 'open' || action === 'preview') &&
    control !== null &&
    !control.hasAttribute(LOCAL_TASK_ROW_ATTRIBUTE)
  ) {
    return null
  }
  return action
}

type EscapeLayer = { close: () => void; kind: 'dialog' | 'panel' }

let pageHandler: ((action: LocalTaskPageKeyAction) => void) | null = null
const escapeLayers: EscapeLayer[] = []

/** The mounted local task page claims single keys; returns the release. */
export function claimLocalTaskPageKeys(
  handler: (action: LocalTaskPageKeyAction) => void
): () => void {
  pageHandler = handler
  return () => {
    if (pageHandler === handler) {
      pageHandler = null
    }
  }
}

/**
 * Esc closes the innermost local surface (dialog, detail, preview) instead of the whole task page.
 * Dialog layers must render their content with `data-local-task-overlay`.
 */
export function pushLocalTaskEscapeLayer(kind: EscapeLayer['kind'], close: () => void): () => void {
  const layer: EscapeLayer = { kind, close }
  escapeLayers.push(layer)
  return () => {
    const index = escapeLayers.indexOf(layer)
    if (index !== -1) {
      escapeLayers.splice(index, 1)
    }
  }
}

function overlayOpen(selector: string): boolean {
  return document.querySelector(selector) !== null
}

function handleEscape(event: KeyboardEvent): void {
  const layer = escapeLayers.at(-1)
  if (!layer || overlayOpen(`[role="dialog"]:not([${LOCAL_TASK_OVERLAY_ATTRIBUTE}])`)) {
    return
  }
  if (overlayOpen(NESTED_OVERLAY_SELECTOR)) {
    return
  }
  // Why: in a panel, the first Esc only leaves the field, matching the upstream task page.
  if (layer.kind === 'panel' && isEditableKeyTarget(event.target)) {
    return
  }
  event.preventDefault()
  // Why immediate: the upstream task page's Esc owner runs after this one and would close the page.
  event.stopImmediatePropagation()
  layer.close()
}

function onKeyDown(event: KeyboardEvent): void {
  if (!pageHandler || event.defaultPrevented || isImeOwnedKeyboardEvent(event)) {
    return
  }
  if (event.key === 'Escape') {
    handleEscape(event)
    return
  }
  if (
    event.key.toLowerCase() === 'f' &&
    (navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    isOnLocalTaskPage(event.target)
  ) {
    event.preventDefault()
    event.stopPropagation()
    pageHandler('search')
    return
  }
  const action = resolveLocalTaskPageKey(event)
  if (!action || overlayOpen(`[role="dialog"], ${NESTED_OVERLAY_SELECTOR}`)) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  pageHandler(action)
}

/** Installed once at app start so it runs ahead of the task page's own Esc owner. */
export function installLocalTaskPageKeyRouter(): () => void {
  addAppKeyListener('keydown', onKeyDown)
  return () => removeAppKeyListener('keydown', onKeyDown)
}
