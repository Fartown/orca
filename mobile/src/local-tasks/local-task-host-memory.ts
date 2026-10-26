import AsyncStorage from '@react-native-async-storage/async-storage'
import { z } from 'zod'
import { salvagingRecord } from '../../../src/shared/zod-salvage'

// Why the phone remembers: a desktop that is not open cannot say it hosts tasks, yet the home card
// should still say "mbp5's Orca is not open" rather than silently drop the entry. Ids only, no tasks.
const STORAGE_KEY = 'orca:localTasks:taskHosts:v1'

const memorySchema = salvagingRecord(z.string(), z.object({ advertisedAt: z.number() }))

export type RememberedLocalTaskHosts = Record<string, { advertisedAt: number }>

export async function loadRememberedLocalTaskHosts(): Promise<RememberedLocalTaskHosts> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = memorySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

/** Records whether `hostId` advertised `local-tasks.v1` on its latest status read. */
export async function recordLocalTaskHostAdvertisement(
  hostId: string,
  advertised: boolean,
  now: number = Date.now()
): Promise<RememberedLocalTaskHosts> {
  const memory = await loadRememberedLocalTaskHosts()
  if (!advertised && !Object.hasOwn(memory, hostId)) {
    return memory
  }
  const next = { ...memory }
  if (advertised) {
    next[hostId] = { advertisedAt: now }
  } else {
    delete next[hostId]
  }
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Why ignored: the record only words an offline hint; losing it drops the hint, nothing else.
  }
  return next
}
