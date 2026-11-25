import {
  aiVaultHistoryAgents,
  isAiVaultAgent
} from '../../../shared/ai-vault/contracts/ai-vault-types'
import {
  getTerminalSessionNameEntry,
  subscribeTerminalSessionNames,
  TERMINAL_SESSION_NAMES_STORAGE_KEY
} from '@/lib/agent-session/history/session-names/terminal-session-names'
import { useAppStore } from '@/store'

const EMPTY_MANUAL_INDEX: ReadonlyMap<string, string> = new Map()
let cachedRawStorage: string | null = null
let cachedLayouts: unknown = undefined
let cachedManualIndex: ReadonlyMap<string, string> = EMPTY_MANUAL_INDEX

function readTerminalLayouts() {
  return typeof useAppStore.getState === 'function'
    ? useAppStore.getState()?.terminalLayoutsByTabId
    : undefined
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOpenSplitTab(tabId: string): boolean {
  return readTerminalLayouts()?.[tabId]?.root?.type === 'split'
}

export function getSavedManualSessionTitle(
  executionHostId: string,
  agent: string,
  sessionId: string
): string | undefined {
  if (!isAiVaultAgent(agent)) {
    return undefined
  }
  const entry = getTerminalSessionNameEntry(executionHostId, sessionId)
  if (!entry || !aiVaultHistoryAgents(entry.agent).includes(agent) || isOpenSplitTab(entry.tabId)) {
    return undefined
  }
  return entry.title
}

export function getSavedManualSessionTitleIndex(): ReadonlyMap<string, string> {
  let raw: string | null = null
  try {
    raw =
      typeof localStorage === 'undefined'
        ? null
        : localStorage.getItem(TERMINAL_SESSION_NAMES_STORAGE_KEY)
  } catch {
    raw = null
  }
  const layouts = readTerminalLayouts()
  if (raw === cachedRawStorage && layouts === cachedLayouts) {
    return cachedManualIndex
  }
  cachedRawStorage = raw
  cachedLayouts = layouts
  if (!raw) {
    cachedManualIndex = EMPTY_MANUAL_INDEX
    return cachedManualIndex
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    cachedManualIndex = EMPTY_MANUAL_INDEX
    return cachedManualIndex
  }
  if (!isPlainRecord(parsed)) {
    cachedManualIndex = EMPTY_MANUAL_INDEX
    return cachedManualIndex
  }
  const next = new Map<string, string>()
  for (const [storageKey, value] of Object.entries(parsed)) {
    const separator = storageKey.indexOf('\0')
    if (separator <= 0 || separator === storageKey.length - 1 || !isPlainRecord(value)) {
      continue
    }
    const title = typeof value.title === 'string' ? value.title.trim() : ''
    const tabId = typeof value.tabId === 'string' ? value.tabId : ''
    if (!title || !tabId || !isAiVaultAgent(value.agent) || isOpenSplitTab(tabId)) {
      continue
    }
    const executionHostId = storageKey.slice(0, separator)
    const sessionId = storageKey.slice(separator + 1)
    for (const alias of aiVaultHistoryAgents(value.agent)) {
      next.set(`${executionHostId}\0${alias}\0${sessionId}`, title)
    }
  }
  cachedManualIndex = next.size > 0 ? next : EMPTY_MANUAL_INDEX
  return cachedManualIndex
}

export function subscribeSavedManualSessionTitles(listener: () => void): () => void {
  const stopNames = subscribeTerminalSessionNames(listener)
  const stopLayouts =
    typeof useAppStore.subscribe === 'function'
      ? useAppStore.subscribe((state, previous) => {
          if (state.terminalLayoutsByTabId !== previous.terminalLayoutsByTabId) {
            listener()
          }
        })
      : () => {}
  return () => {
    stopNames()
    stopLayouts()
  }
}
