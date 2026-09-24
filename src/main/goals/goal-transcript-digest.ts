// The guard's view of the worker transcript since its last review: who said what, whether
// the driver's messages arrived whole, how turns ended. Raw rounds reach tens of MB, so the
// guard reads this and goes to the full transcript only to verify.
import { open, type FileHandle } from 'node:fs/promises'
import {
  goalTranscriptEntry,
  type GoalTranscriptEntry,
  type GoalTranscriptFamily
} from './goal-transcript-entries'

export type GoalSentMessage = { at: number; text: string }
/** Where the previous digest stopped: byte offset of the next unread line and its number. */
export type GoalTranscriptCursor = { path: string; offset: number; line: number }

export type GoalTranscriptDigestInput = {
  path: string
  family: GoalTranscriptFamily
  cursor: GoalTranscriptCursor | null
  /** What the driver typed into the terminal lately, to recognise it and its fragments. */
  sent: readonly GoalSentMessage[]
  autoPrefix: string
  maxChars?: number
}

export type GoalTranscriptDigest = { text: string; cursor: GoalTranscriptCursor }

type Row = { line: number; kind: GoalTranscriptEntry['kind']; text: string }

const CHUNK_BYTES = 4 * 1024 * 1024
const FIRST_READ_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_CHARS = 60_000
const HUMAN_LIMIT = 4_000
const AGENT_LIMIT = 2_000
const DRIVER_PREVIEW = 80
const FRAGMENT_MIN = 20

export async function digestGoalTranscript(
  input: GoalTranscriptDigestInput
): Promise<GoalTranscriptDigest> {
  const rows: Row[] = []
  const tools = new Map<string, number>()
  let toolLine = 0
  const flushTools = (): void => {
    if (tools.size > 0) {
      const total = [...tools.values()].reduce((sum, n) => sum + n, 0)
      const names = [...tools].map(([name, n]) => `${name}×${n}`).join('、')
      rows.push({ line: toolLine, kind: 'tools', text: `（调用工具 ${total} 次：${names}）` })
      tools.clear()
    }
  }
  const read = await readNewLines(input.path, input.cursor, (text, line) => {
    const entry = goalTranscriptEntry(text, input.family)
    if (!entry) {
      return
    }
    if (entry.kind === 'tools') {
      toolLine = tools.size === 0 ? line : toolLine
      entry.names.forEach((name) => tools.set(name, (tools.get(name) ?? 0) + 1))
      return
    }
    flushTools()
    rows.push({ line, kind: entry.kind, text: describeEntry(entry, line, input) })
  })
  flushTools()
  return { text: render(rows, input, read), cursor: read.cursor }
}

type ReadResult = { cursor: GoalTranscriptCursor; firstLine: number; skippedHead: boolean }

async function readNewLines(
  path: string,
  previous: GoalTranscriptCursor | null,
  onLine: (text: string, line: number) => void
): Promise<ReadResult> {
  const handle = await open(path, 'r')
  try {
    const size = (await handle.stat()).size
    const chunk = Buffer.alloc(CHUNK_BYTES)
    // A different or shrunken file is a new transcript: start over.
    const resume = previous && previous.path === path && previous.offset <= size ? previous : null
    let { offset, line } = resume ?? { offset: 0, line: 0 }
    const skippedHead = !resume && size > FIRST_READ_BYTES
    if (skippedHead) {
      // First look at a long session: only its tail matters, but line numbers must stay real.
      ;({ offset, line } = await countLinesUntil(handle, chunk, size - FIRST_READ_BYTES, size))
    }
    const firstLine = line + 1
    let pending: Buffer[] = []
    let position = offset
    while (position < size) {
      const { bytesRead } = await handle.read(
        chunk,
        0,
        Math.min(CHUNK_BYTES, size - position),
        position
      )
      if (bytesRead === 0) {
        break
      }
      let start = 0
      for (
        let nl = chunk.indexOf(10, 0);
        nl !== -1 && nl < bytesRead;
        nl = chunk.indexOf(10, start)
      ) {
        pending.push(Buffer.from(chunk.subarray(start, nl)))
        const bytes = Buffer.concat(pending)
        pending = []
        line += 1
        offset += bytes.length + 1
        onLine(bytes.toString('utf8'), line)
        start = nl + 1
      }
      // The writer may be mid-line; an unterminated tail is read next time.
      pending.push(Buffer.from(chunk.subarray(start, bytesRead)))
      position += bytesRead
    }
    return { cursor: { path, offset, line }, firstLine, skippedHead }
  } finally {
    await handle.close()
  }
}

/** Offset and number of the first line that starts at or after `target`. */
async function countLinesUntil(
  handle: FileHandle,
  chunk: Buffer,
  target: number,
  size: number
): Promise<{ offset: number; line: number }> {
  let line = 0
  let position = 0
  while (position < size) {
    const { bytesRead } = await handle.read(
      chunk,
      0,
      Math.min(CHUNK_BYTES, size - position),
      position
    )
    if (bytesRead === 0) {
      break
    }
    for (
      let nl = chunk.indexOf(10, 0);
      nl !== -1 && nl < bytesRead;
      nl = chunk.indexOf(10, nl + 1)
    ) {
      line += 1
      if (position + nl + 1 >= target) {
        return { offset: position + nl + 1, line }
      }
    }
    position += bytesRead
  }
  return { offset: size, line }
}

function describeEntry(
  entry: Exclude<GoalTranscriptEntry, { kind: 'tools' }>,
  line: number,
  input: GoalTranscriptDigestInput
): string {
  const stamp = entry.at === null ? '' : ` ${localTime(entry.at)}`
  const head = `L${line}${stamp} `
  switch (entry.kind) {
    case 'human':
      return head + describeHuman(entry.text, entry.queued, line, input)
    case 'agent':
      return `${head}agent：${clip(entry.text, AGENT_LIMIT, line)}`
    case 'error':
      return `${head}agent 报错：${clip(entry.text, AGENT_LIMIT, line)}`
    case 'interrupt':
      return `${head}—— 被中断 ——`
    case 'turn-end':
      return `${head}—— 这一轮结束 ——`
    case 'compaction':
      return `${head}（上下文压缩）`
  }
}

function describeHuman(
  raw: string,
  queued: boolean,
  line: number,
  input: GoalTranscriptDigestInput
): string {
  const text = squash(raw)
  const busy = queued ? '（agent 忙时收到）' : ''
  const delivery = driverDelivery(text, input)
  return delivery === null
    ? `用户${busy}：${clip(raw.trim(), HUMAN_LIMIT, line)}`
    : `驱动消息${busy}${delivery}：${clip(text, DRIVER_PREVIEW, line)}`
}

/** null: the user wrote it. Otherwise how the driver's message arrived. */
function driverDelivery(text: string, input: GoalTranscriptDigestInput): string | null {
  const sent = input.sent.map((message) => squash(message.text))
  if (sent.includes(text)) {
    return '（完整送达）'
  }
  // The agent's harness can append to a delivered message; what the driver sent is all there.
  const contained = sent.find((message) => text.includes(message))
  if (contained) {
    return `（完整送达，另有 ${text.length - contained.length} 字不是驱动发的）`
  }
  if (text.startsWith(input.autoPrefix)) {
    const origin = sent.find((message) => message.startsWith(text.slice(0, 40)))
    return origin
      ? `（没有完整送达：记录里 ${text.length} 字，发出的是 ${origin.length} 字）`
      : '（无法核对是否完整）'
  }
  const whole = text.length >= FRAGMENT_MIN ? sent.find((message) => message.includes(text)) : null
  return whole ? `（只收到一段：${text.length} 字，发出的是 ${whole.length} 字）` : null
}

function render(rows: Row[], input: GoalTranscriptDigestInput, read: ReadResult): string {
  const kept = fitRows(rows, input.maxChars ?? DEFAULT_MAX_CHARS)
  const scope = read.skippedHead
    ? '（首次复盘，只读了最后一段；更早的内容按需去完整记录里查）'
    : read.firstLine === 1
      ? '（从头读起）'
      : '（上次复盘之后的新内容）'
  const header = [
    '# 执行 agent 对话摘要（驱动整理）',
    `记录：${input.path}，本次读了第 ${read.firstLine}–${read.cursor.line} 行${scope}。`,
    '只列用户和驱动的消息、agent 的文字回复、报错、中断、轮次结束和上下文压缩；工具调用只计次数，结果没有列出。要核实细节，按行号去完整记录里查。时间是执行主机的本地时间。'
  ]
  if (kept.omitted > 0) {
    header.push(
      `为控制篇幅，省略了较早的 ${kept.omitted} 条（第 ${kept.from}–${kept.to} 行之间），需要时去完整记录里查。`
    )
  }
  const body =
    kept.rows.length > 0 ? kept.rows.map((row) => row.text) : ['这段时间记录里没有新内容。']
  return `${header.join('\n')}\n\n${body.join('\n')}\n`
}

/** Drop the oldest agent replies first; the people's messages and markers go last. */
function fitRows(
  rows: Row[],
  maxChars: number
): { rows: Row[]; omitted: number; from: number; to: number } {
  let total = rows.reduce((sum, row) => sum + row.text.length + 1, 0)
  const dropped = new Set<number>()
  for (const pass of [(row: Row) => row.kind === 'agent' || row.kind === 'tools', () => true]) {
    for (let i = 0; i < rows.length && total > maxChars; i += 1) {
      if (!dropped.has(i) && pass(rows[i])) {
        dropped.add(i)
        total -= rows[i].text.length + 1
      }
    }
  }
  let from = 0
  let to = 0
  for (const i of dropped) {
    from = from === 0 ? rows[i].line : Math.min(from, rows[i].line)
    to = Math.max(to, rows[i].line)
  }
  return { rows: rows.filter((_, i) => !dropped.has(i)), omitted: dropped.size, from, to }
}

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function clip(text: string, limit: number, line: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…（截断，全文见第 ${line} 行）`
}

function localTime(at: number): string {
  const d = new Date(at)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
