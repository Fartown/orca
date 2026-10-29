import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import type {
  LocalTaskLinks,
  LocalTaskProgressSnapshot
} from '../../../src/shared/local-tasks/local-task-link-types'
import type {
  LocalTask,
  LocalTaskChangeScope
} from '../../../src/shared/local-tasks/local-task-types'
import type { RpcClient } from '../transport/rpc-client'
import { createLocalTasksApi } from './local-tasks-api'
import { localTaskLibraryHasProjects } from './local-tasks-access'
import { startLocalTasksChangeFeed } from './local-tasks-change-feed'

/** What session screens show of one library; each part stays null until it is first read. */
export type LocalTaskSessionLibraryData = {
  links: LocalTaskLinks | null
  tasks: LocalTask[] | null
  progress: LocalTaskProgressSnapshot | null
}

export type LocalTaskSessionLibrarySnapshot = {
  data: LocalTaskSessionLibraryData | null
  /** False while the data is the last read rather than followed live: out of contact, or reading. */
  fresh: boolean
}

type Part = keyof LocalTaskSessionLibraryData
type Presence = 'unknown' | 'none' | 'some'
type FeedAppState = Parameters<typeof startLocalTasksChangeFeed>[0]['appState']

const ALL_PARTS: readonly Part[] = ['links', 'tasks', 'progress']
const EMPTY_DATA: LocalTaskSessionLibraryData = { links: null, tasks: null, progress: null }
const EMPTY_SNAPSHOT: LocalTaskSessionLibrarySnapshot = { data: null, fresh: false }

function partsFor(scopes: readonly LocalTaskChangeScope[]): Part[] {
  const parts: Part[] = []
  if (scopes.includes('links')) {
    parts.push('links')
  }
  if (scopes.includes('tasks')) {
    parts.push('tasks')
  }
  // Why only progress: a "Needs you" change does not touch the tasks the strip names.
  if (scopes.includes('attention')) {
    parts.push('progress')
  }
  return parts
}

type Member = { reachable: boolean; asked: boolean }

export type LocalTaskSessionLibraryMember = {
  update: (client: RpcClient | null, reachable: boolean) => void
  leave: () => void
}

export type LocalTaskSessionLibraryWatch = ReturnType<typeof createLocalTaskSessionLibraryWatch>

/**
 * One library as every session screen of this document sees it: one status read, then — only when
 * the library has a project — one change subscription and one set of reads, however many session
 * screens are open on it. A library with no project gets no subscription, no list and no "Needs
 * you" read; since the host does not push its project count, its status is read again only when a
 * session screen opens on it or contact with it comes back (never on a timer, never on foreground).
 * Out of contact, the last read stays and is marked not fresh.
 */
export function createLocalTaskSessionLibraryWatch(appState: FeedAppState) {
  let client: RpcClient | null = null
  let presence: Presence = 'unknown'
  let statusFlight: object | null = null
  let stopFeed: (() => void) | null = null
  // A feed run: a read that lands after its run ended updates the data but cannot vouch for it.
  let run = 0
  let snapshot = EMPTY_SNAPSHOT
  const members = new Set<Member>()
  const listeners = new Set<() => void>()
  const turns: Record<Part, number> = { links: 0, tasks: 0, progress: 0 }

  const publish = (next: LocalTaskSessionLibrarySnapshot): void => {
    snapshot = next
    for (const listener of listeners) {
      listener()
    }
  }
  const reachable = (): boolean =>
    client !== null && [...members].some((member) => member.reachable)

  const stop = (): void => {
    if (!stopFeed) {
      return
    }
    stopFeed()
    stopFeed = null
    run += 1
    if (snapshot.fresh) {
      publish({ ...snapshot, fresh: false })
    }
  }

  const readPart = <P extends Part>(
    part: P,
    read: () => Promise<LocalTaskSessionLibraryData[P]>
  ): void => {
    const turn = ++turns[part]
    const startedIn = run
    read().then(
      (value) => {
        if (turn !== turns[part]) {
          return
        }
        const data: LocalTaskSessionLibraryData = { ...(snapshot.data ?? EMPTY_DATA) }
        data[part] = value
        const complete = data.links !== null && data.tasks !== null
        publish({ data, fresh: complete && stopFeed !== null && run === startedIn })
      },
      // A failed read keeps what was shown; the next notice, `ready` or foreground reads again.
      () => {}
    )
  }

  const reload = (parts: readonly Part[]): void => {
    if (!client || !stopFeed) {
      return
    }
    const api = createLocalTasksApi(client)
    if (parts.includes('links')) {
      readPart('links', () => api.links())
    }
    if (parts.includes('tasks')) {
      readPart('tasks', () => api.tasks())
    }
    if (parts.includes('progress')) {
      readPart('progress', () => api.progress())
    }
  }

  const sync = (): void => {
    if (!reachable() || presence !== 'some') {
      stop()
      return
    }
    if (!stopFeed && client) {
      run += 1
      stopFeed = startLocalTasksChangeFeed({
        client,
        appState,
        onFullReload: () => reload(ALL_PARTS),
        onScopes: (scopes) => reload(partsFor(scopes))
      })
    }
  }

  const readPresence = (): void => {
    if (!client || statusFlight) {
      return
    }
    const flight = {}
    statusFlight = flight
    createLocalTasksApi(client)
      .status()
      .then(
        (status) => {
          if (statusFlight !== flight) {
            return
          }
          statusFlight = null
          presence = localTaskLibraryHasProjects(status) ? 'some' : 'none'
          if (presence === 'none' && snapshot.data) {
            publish(EMPTY_SNAPSHOT)
          }
          sync()
        },
        () => {
          if (statusFlight === flight) {
            statusFlight = null
          }
        }
      )
  }

  return {
    getSnapshot: (): LocalTaskSessionLibrarySnapshot => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    reload: (): void => reload(ALL_PARTS),
    join: (): LocalTaskSessionLibraryMember => {
      const member: Member = { reachable: false, asked: false }
      members.add(member)
      return {
        update: (next, nextReachable) => {
          if (!members.has(member)) {
            return
          }
          const swapped = next !== null && next !== client
          if (swapped) {
            stop()
            statusFlight = null
            client = next
          }
          const firstContact = nextReachable && !member.asked
          const regained = nextReachable && (!member.reachable || swapped)
          member.reachable = nextReachable
          if (firstContact) {
            member.asked = true
          }
          // The host never pushes its project count, so a library without one (or unread) is asked
          // again only when a session screen opens on it or contact with it comes back.
          if (reachable() && presence !== 'some' && (firstContact || regained)) {
            readPresence()
          }
          sync()
        },
        leave: () => {
          if (!members.delete(member)) {
            return
          }
          if (members.size > 0) {
            sync()
            return
          }
          stop()
          presence = 'unknown'
          statusFlight = null
          for (const part of ALL_PARTS) {
            turns[part] += 1
          }
          publish(EMPTY_SNAPSHOT)
        }
      }
    }
  }
}

const watches = new Map<string, LocalTaskSessionLibraryWatch>()

/** The document's one watch for a library, named by its paired host and server. */
export function localTaskSessionLibraryWatch(key: string): LocalTaskSessionLibraryWatch {
  let watch = watches.get(key)
  if (!watch) {
    watch = createLocalTaskSessionLibraryWatch(AppState)
    watches.set(key, watch)
  }
  return watch
}

const noSubscription = () => () => {}
const emptySnapshot = () => EMPTY_SNAPSHOT

/**
 * A session screen's share of its library. `client` is null when the library cannot be asked (no
 * local tasks there); `reachable` is whether it is in contact now.
 */
export function useLocalTaskSessionLibrary(
  key: string | null,
  client: RpcClient | null,
  reachable: boolean
): LocalTaskSessionLibrarySnapshot & { reload: () => void } {
  const watch = useMemo(() => (key ? localTaskSessionLibraryWatch(key) : null), [key])
  const snapshot = useSyncExternalStore(
    watch ? watch.subscribe : noSubscription,
    watch ? watch.getSnapshot : emptySnapshot
  )
  const member = useRef<LocalTaskSessionLibraryMember | null>(null)
  useEffect(() => {
    if (!watch) {
      return
    }
    const joined = watch.join()
    member.current = joined
    return () => {
      joined.leave()
      member.current = null
    }
  }, [watch])
  useEffect(() => {
    member.current?.update(client, reachable && client !== null)
  }, [watch, client, reachable])
  return { ...snapshot, reload: watch ? watch.reload : noReload }
}

function noReload(): void {}
