import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  GoalControlIntentSchema,
  GoalOperationReceiptSchema,
  GoalRecordSchema,
  GoalVersionLineSchema,
  LegacyGoalRecordSchema,
  ownedLegacyRecord,
  type GoalControlIntent,
  type GoalOperationReceipt,
  type GoalRecord,
  type GoalVersionLine,
  type LegacyGoalRecord
} from '../../shared/goals/goal-store-records'
import { composeGoalAcceptanceText } from '../../shared/goals/goal-judge-contract'
import {
  goalControlPath,
  goalDir,
  goalJudgeCriteriaPath,
  goalOperationPath,
  goalJudgeItemsPath,
  goalRecordPath,
  goalsV2Dir,
  goalVersionsPath,
  legacyGoalRecordPath,
  legacyLockPath
} from '../../shared/goals/goal-store-layout'

/** Host-side reads and writes of the v2 goal directory; every write is tmp + rename. */
export class GoalStore {
  constructor(readonly goalHome: string) {}

  async readRecord(goalId: string): Promise<GoalRecord | null> {
    const raw = await readJson(goalRecordPath(this.goalHome, goalId))
    if (raw === null) {
      return null
    }
    const parsed = GoalRecordSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  }

  /** The record plus both judge inputs: all host-owned, always rewritten together. */
  async writeRecord(record: GoalRecord): Promise<void> {
    await writeJsonAtomic(goalRecordPath(this.goalHome, record.goalId), record)
    await writeJsonAtomic(goalJudgeItemsPath(this.goalHome, record.goalId), {
      goalId: record.goalId,
      specRevision: record.specRevision,
      items: record.spec.criteria
        .filter((criterion) => !criterion.command)
        .map(({ id, description }) => ({ id, description })),
      notes: record.spec.acceptanceText
    })
    // Why unconditional: an amend that flips the goal between judge modes must never leave a stale blob.
    await writeTextAtomic(
      goalJudgeCriteriaPath(this.goalHome, record.goalId),
      `${composeGoalAcceptanceText(record.spec)}\n`
    )
  }

  async deleteGoal(goalId: string): Promise<void> {
    await rm(goalDir(this.goalHome, goalId), { recursive: true, force: true })
  }

  /** Corrupt or foreign entries are skipped, never allowed to blank the list. */
  async listRecords(): Promise<GoalRecord[]> {
    let names: string[]
    try {
      names = await readdir(goalsV2Dir(this.goalHome))
    } catch (error) {
      if (isMissing(error)) {
        return []
      }
      throw error
    }
    const records = await Promise.all(names.map((name) => this.readRecord(name)))
    return records.filter((record): record is GoalRecord => record !== null)
  }

  async readControl(goalId: string): Promise<GoalControlIntent | null> {
    const raw = await readJson(goalControlPath(this.goalHome, goalId))
    if (raw === null) {
      return null
    }
    const parsed = GoalControlIntentSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  }

  async writeControl(goalId: string, intent: GoalControlIntent): Promise<void> {
    await writeJsonAtomic(goalControlPath(this.goalHome, goalId), intent)
  }

  async readReceipt(clientOperationId: string): Promise<GoalOperationReceipt | null> {
    const raw = await readJson(goalOperationPath(this.goalHome, clientOperationId))
    if (raw === null) {
      return null
    }
    const parsed = GoalOperationReceiptSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  }

  async writeReceipt(receipt: GoalOperationReceipt): Promise<void> {
    await writeJsonAtomic(goalOperationPath(this.goalHome, receipt.clientOperationId), receipt)
  }

  async appendVersion(goalId: string, line: GoalVersionLine): Promise<void> {
    const file = goalVersionsPath(this.goalHome, goalId)
    await mkdir(dirname(file), { recursive: true })
    await appendFile(file, `${JSON.stringify(line)}\n`, 'utf8')
  }

  /** Saved definitions, oldest first; a corrupt line is skipped, not fatal. */
  async readVersions(goalId: string): Promise<GoalVersionLine[]> {
    let raw: string
    try {
      raw = await readFile(goalVersionsPath(this.goalHome, goalId), 'utf8')
    } catch (error) {
      if (isMissing(error)) {
        return []
      }
      throw error
    }
    const lines: GoalVersionLine[] = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) {
        continue
      }
      try {
        const parsed = GoalVersionLineSchema.safeParse(JSON.parse(line))
        if (parsed.success) {
          lines.push(parsed.data)
        }
      } catch {
        // skip
      }
    }
    return lines
  }

  /**
   * The v1 record belongs to the driver while one runs. The host only writes it
   * once the driver is positively gone, to settle a stop or reflect a rebind.
   */
  async writeLegacyRecord(key: string, record: LegacyGoalRecord): Promise<void> {
    await writeJsonAtomic(legacyGoalRecordPath(this.goalHome, key), {
      ...record,
      updatedAt: Date.now()
    })
  }

  /** Every v1 record on disk, including ones already adopted; callers filter by goalId. */
  async listLegacyRecords(): Promise<LegacyGoalRecord[]> {
    let names: string[]
    try {
      names = await readdir(dirname(legacyGoalRecordPath(this.goalHome, 'x')))
    } catch (error) {
      if (isMissing(error)) {
        return []
      }
      throw error
    }
    const records = await Promise.all(
      names
        .filter((name) => name.endsWith('.json'))
        .map((name) => this.readLegacyRecord(name.slice(0, -'.json'.length)))
    )
    return records.filter((record): record is LegacyGoalRecord => record !== null)
  }

  async readLegacyRecord(key: string): Promise<LegacyGoalRecord | null> {
    const raw = await readJson(legacyGoalRecordPath(this.goalHome, key))
    if (raw === null) {
      return null
    }
    const parsed = LegacyGoalRecordSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  }

  /** The v1 record only speaks for this goal while it names it; see ownedLegacyRecord. */
  async readOwnedLegacyRecord(
    record: Pick<GoalRecord, 'goalId' | 'legacyKey'>
  ): Promise<LegacyGoalRecord | null> {
    if (!record.legacyKey) {
      return null
    }
    return ownedLegacyRecord(record, await this.readLegacyRecord(record.legacyKey))
  }

  /** The v1 lock file records the driver pid; a missing or malformed lock reads as null. */
  async readLegacyLockPid(key: string): Promise<number | null> {
    const raw = await readJson(legacyLockPath(this.goalHome, key))
    if (!raw || typeof raw !== 'object') {
      return null
    }
    const pid = (raw as { pid?: unknown }).pid
    return Number.isInteger(pid) && (pid as number) > 0 ? (pid as number) : null
  }
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) {
      return null
    }
    throw error
  }
}

async function writeTextAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, path)
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`)
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'
  )
}
