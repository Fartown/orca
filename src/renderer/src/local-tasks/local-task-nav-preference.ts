const STORAGE_KEY = 'orca.localTaskNavExpanded.v1'

export function readLocalTaskNavExpanded(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

export function persistLocalTaskNavExpanded(expanded: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, expanded ? '1' : '0')
  } catch {
    // The in-memory choice still applies when client storage is unavailable.
  }
}
