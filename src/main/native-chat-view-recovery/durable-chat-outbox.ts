import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  DurableChatRecord,
  type DurableChatSubmitRecord
} from '../../shared/native-chat-view-recovery/durable-chat-submit'
import { durableWriteTempPath, writeFileDurable } from '../filesystem/durable-file-write'

export class DurableChatOutbox {
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly path: string) {}

  async list(): Promise<DurableChatSubmitRecord[]> {
    await this.tail
    return this.read()
  }

  private async read(): Promise<DurableChatSubmitRecord[]> {
    try {
      return z.array(DurableChatRecord).parse(JSON.parse(await readFile(this.path, 'utf8')))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  update(change: (records: DurableChatSubmitRecord[]) => DurableChatSubmitRecord[]): Promise<void> {
    const write = this.tail.then(async () => {
      const current = await this.read()
      const records = change(current)
      if (records === current) {
        return
      }
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      await writeFileDurable(
        durableWriteTempPath(this.path),
        this.path,
        JSON.stringify(records),
        0o600
      )
    })
    this.tail = write.catch(() => {})
    return write
  }
}
