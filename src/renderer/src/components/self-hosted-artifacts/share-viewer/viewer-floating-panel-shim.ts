// Why: the share page has no floating workspace panel, so nothing on it is ever inside one.
export function isEventTargetInsideFloatingWorkspacePanel(_target: EventTarget | null): boolean {
  return false
}
