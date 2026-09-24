import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { digestGoalTranscript, type GoalSentMessage } from './goal-transcript-digest'

const PREFIX = '【Goal 自动消息】'
const T = '2026-09-24T01:00:00.000Z'
let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'goal-digest-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const jsonl = (records: unknown[]): string =>
  `${records.map((r) => JSON.stringify(r)).join('\n')}\n`

async function transcript(records: unknown[]): Promise<string> {
  const file = join(dir, 'session.jsonl')
  await writeFile(file, jsonl(records))
  return file
}

const claudeUser = (content: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'user',
  timestamp: T,
  uuid: `u-${Math.random()}`,
  message: { role: 'user', content },
  ...extra
})
const claudeText = (text: string, extra: Record<string, unknown> = {}) => ({
  type: 'assistant',
  timestamp: T,
  uuid: `a-${Math.random()}`,
  message: { role: 'assistant', content: [{ type: 'text', text }] },
  ...extra
})
const claudeTool = (name: string) => ({
  type: 'assistant',
  timestamp: T,
  uuid: `t-${Math.random()}`,
  message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name, input: {} }] }
})

describe('digestGoalTranscript: claude', () => {
  it('separates the user, the driver and machinery, and tells whether driver messages arrived whole', async () => {
    const sent: GoalSentMessage[] = [
      { at: 1, text: `${PREFIX}守卫看到的:还缺 a 守卫的指示:去改 a.ts` },
      { at: 2, text: `${PREFIX}${'很长的续跑消息。'.repeat(40)}结尾指示` }
    ]
    const path = await transcript([
      claudeUser(`<pasted_content id="b1">${sent[0].text}</pasted_content id="b1">`),
      claudeTool('Bash'),
      claudeTool('Bash'),
      claudeTool('Edit'),
      claudeText('改好了 a.ts,测试没跑'),
      { type: 'system', subtype: 'turn_duration', timestamp: T },
      claudeUser(`${sent[0].text}\n[来自终端的附加说明]`),
      claudeUser(sent[1].text.slice(0, 60)),
      claudeUser(sent[1].text.slice(-50)),
      claudeUser('先别动 b.ts'),
      claudeUser('<task-notification>\n<task-id>1</task-id>\n</task-notification>', {
        origin: { kind: 'system' }
      }),
      claudeUser('[Image: source: /tmp/a.png]', { isMeta: true }),
      claudeUser('This session is being continued from a previous conversation…', {
        isCompactSummary: true
      }),
      {
        type: 'attachment',
        timestamp: T,
        attachment: { type: 'queued_command', prompt: '顺便看下 c', commandMode: 'prompt' }
      },
      {
        type: 'attachment',
        timestamp: T,
        attachment: {
          type: 'queued_command',
          prompt: '<task-notification>done</task-notification>',
          commandMode: 'task-notification'
        }
      },
      { type: 'system', subtype: 'compact_boundary', timestamp: T },
      claudeText('API Error: The response stopped arriving.', { isApiErrorMessage: true }),
      claudeUser([{ type: 'text', text: '[Request interrupted by user]' }], {
        interruptedMessageId: 'm1'
      })
    ])
    const { text, cursor } = await digestGoalTranscript({
      path,
      family: 'claude',
      cursor: null,
      sent,
      autoPrefix: PREFIX
    })

    const rows = text.split('\n').filter((row) => row.startsWith('L') || row.startsWith('（'))
    expect(rows).toHaveLength(12)
    expect(rows[0]).toMatch(/^L1 .* 驱动消息（完整送达）：【Goal 自动消息】守卫看到的/)
    expect(rows[1]).toBe('（调用工具 3 次：Bash×2、Edit×1）')
    expect(rows[2]).toMatch(/agent：改好了 a\.ts,测试没跑$/)
    expect(rows[3]).toMatch(/—— 这一轮结束 ——$/)
    expect(rows[4]).toMatch(/驱动消息（完整送达，另有 12 字不是驱动发的）/)
    expect(rows[5]).toMatch(/驱动消息（没有完整送达：记录里 60 字，发出的是 \d+ 字）/)
    expect(rows[6]).toMatch(/驱动消息（只收到一段：50 字/)
    expect(rows[7]).toMatch(/L10 .* 用户：先别动 b\.ts$/)
    expect(rows[8]).toMatch(/L14 .* 用户（agent 忙时收到）：顺便看下 c$/)
    expect(rows[9]).toMatch(/L16 .*（上下文压缩）$/)
    expect(rows[10]).toMatch(/agent 报错：API Error/)
    expect(rows[11]).toMatch(/L18 .* —— 被中断 ——$/)
    expect(text).not.toMatch(/task-notification|Image: source|being continued/)
    expect(cursor).toMatchObject({ path, line: 18 })
  })
})

describe('digestGoalTranscript: codex', () => {
  const event = (payload: Record<string, unknown>) => ({ timestamp: T, type: 'event_msg', payload })
  const item = (type: string, text: string) =>
    event({
      type: 'item_completed',
      item: { id: `i-${Math.random()}`, type, content: [{ type: 'text', text }] }
    })

  it('reads words from completed turn items and skips injected instructions and duplicates', async () => {
    const path = await transcript([
      {
        timestamp: T,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '# AGENTS.md instructions' }]
        }
      },
      item('UserMessage', '<environment_context>cwd</environment_context>'),
      item('UserMessage', '把 list 404 查清楚'),
      {
        timestamp: T,
        type: 'response_item',
        payload: { type: 'custom_tool_call', name: 'exec', input: 'ls' }
      },
      {
        timestamp: T,
        type: 'response_item',
        payload: { type: 'custom_tool_call_output', output: 'x'.repeat(5000) }
      },
      {
        timestamp: T,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '查到原因了' }]
        }
      },
      item('AgentMessage', '查到原因了'),
      event({ type: 'task_complete' }),
      { timestamp: T, type: 'compacted', payload: { replacement_history: [] } },
      event({ type: 'turn_aborted' })
    ])
    const { text } = await digestGoalTranscript({
      path,
      family: 'codex',
      cursor: null,
      sent: [],
      autoPrefix: PREFIX
    })

    const rows = text.split('\n').filter((row) => row.startsWith('L') || row.startsWith('（'))
    expect(rows).toEqual([
      expect.stringMatching(/^L3 .* 用户：把 list 404 查清楚$/),
      '（调用工具 1 次：exec×1）',
      expect.stringMatching(/^L7 .* agent：查到原因了$/),
      expect.stringMatching(/^L8 .* —— 这一轮结束 ——$/),
      expect.stringMatching(/^L9 .*（上下文压缩）$/),
      expect.stringMatching(/^L10 .* —— 被中断 ——$/)
    ])
  })
})

describe('digestGoalTranscript: reading position', () => {
  it('continues after the previous cursor and leaves a half-written line for next time', async () => {
    const path = await transcript([claudeUser('第一句'), claudeText('回复一')])
    const first = await digestGoalTranscript({
      path,
      family: 'claude',
      cursor: null,
      sent: [],
      autoPrefix: PREFIX
    })
    expect(first.cursor.line).toBe(2)

    await appendFile(
      path,
      `${JSON.stringify(claudeUser('第二句'))}\n${JSON.stringify(claudeText('写了一半')).slice(0, 20)}`
    )
    const second = await digestGoalTranscript({
      path,
      family: 'claude',
      cursor: first.cursor,
      sent: [],
      autoPrefix: PREFIX
    })
    expect(second.text).toMatch(/本次读了第 3–3 行（上次复盘之后的新内容）/)
    expect(second.text).toMatch(/L3 .* 用户：第二句/)
    expect(second.text).not.toMatch(/第一句|写了一半/)
    expect(second.cursor.line).toBe(3)
  })

  it('starts over when the transcript file changed', async () => {
    const path = await transcript([claudeUser('新会话')])
    const { text } = await digestGoalTranscript({
      path,
      family: 'claude',
      cursor: { path: join(dir, 'old.jsonl'), offset: 999, line: 50 },
      sent: [],
      autoPrefix: PREFIX
    })
    expect(text).toMatch(/本次读了第 1–1 行（从头读起）/)
  })

  it('reads only the tail of a long session on the first look, keeping real line numbers', async () => {
    const filler = claudeText('x'.repeat(1024 * 1024))
    const path = await transcript([
      ...Array.from({ length: 12 }, () => filler),
      claudeUser('最近的一句')
    ])
    const { text, cursor } = await digestGoalTranscript({
      path,
      family: 'claude',
      cursor: null,
      sent: [],
      autoPrefix: PREFIX
    })
    expect(text).toMatch(/首次复盘，只读了最后一段/)
    expect(text).toMatch(/L13 .* 用户：最近的一句/)
    expect(cursor.line).toBe(13)
  })

  it('drops the oldest agent replies first when over budget, keeping what people said', async () => {
    const path = await transcript([
      claudeUser('用户的要求'),
      ...Array.from({ length: 20 }, (_, i) => claudeText(`回复 ${i} ${'y'.repeat(200)}`)),
      claudeUser('用户后来的话')
    ])
    const { text } = await digestGoalTranscript({
      path,
      family: 'claude',
      cursor: null,
      sent: [],
      autoPrefix: PREFIX,
      maxChars: 1500
    })
    expect(text).toMatch(/用户的要求/)
    expect(text).toMatch(/用户后来的话/)
    expect(text).toMatch(/回复 19/)
    expect(text).not.toMatch(/回复 0 /)
    expect(text).toMatch(/省略了较早的 \d+ 条（第 2–\d+ 行之间）/)
  })
})
