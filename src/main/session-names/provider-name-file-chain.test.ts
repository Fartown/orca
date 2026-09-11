import { appendFile, mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readAiVaultSessionTitlesFromFiles } from '../ai-vault/session-title-file-reader'
import { parseAiVaultSessionTitlesResult } from '../ai-vault/session-title-result-validation'
import { resolveTerminalTabTitle } from '../../shared/tab-title-resolution'
import { projectSessionNameSlot } from '../../shared/session-names/session-name-slot'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
const jsonl = (records: unknown[]) =>
  `${records.map((record) => JSON.stringify(record)).join('\n')}\n`
async function root() {
  const path = await mkdtemp(join(tmpdir(), 'orca-name-chain-'))
  roots.push(path)
  return path
}

describe('file to parser to transport to shared presentation', () => {
  it('reparses a same-length Claude title rewrite when mtime changes', async () => {
    const transcriptPath = join(await root(), 'session.jsonl')
    const content = (customTitle: string) =>
      jsonl([
        { type: 'user', sessionId: 'session', message: { content: '运行测试' } },
        { type: 'custom-title', sessionId: 'session', customTitle }
      ])
    await writeFile(transcriptPath, content('Native AAAA'))
    await utimes(transcriptPath, 1_750_000_000, 1_750_000_000)
    const before = await stat(transcriptPath)
    const request = { agent: 'claude' as const, sessionId: 'session', transcriptPath }
    expect(
      (await readAiVaultSessionTitlesFromFiles([request])).nameEvidence?.[0]?.providerName
    ).toMatchObject({ kind: 'named', title: 'Native AAAA' })
    await writeFile(transcriptPath, content('Native BBBB'))
    await utimes(transcriptPath, 1_750_000_001, 1_750_000_001)
    const after = await stat(transcriptPath)
    expect(after.size).toBe(before.size)
    expect(after.mtimeMs).not.toBe(before.mtimeMs)
    expect(
      (await readAiVaultSessionTitlesFromFiles([request])).nameEvidence?.[0]?.providerName
    ).toMatchObject({ kind: 'named', title: 'Native BBBB' })
  })

  it('keeps the first valid Claude task across preview rollover and native rename', async () => {
    const transcriptPath = join(await root(), 'session.jsonl')
    const user = (content: string) => ({ type: 'user', sessionId: 'session', message: { content } })
    await writeFile(transcriptPath, jsonl([user('继续'), user('运行测试')]))
    const request = { agent: 'claude' as const, sessionId: 'session', transcriptPath }
    const read = async () =>
      parseAiVaultSessionTitlesResult(await readAiVaultSessionTitlesFromFiles([request]))
    const first = await read()
    expect(first.nameEvidence?.[0]).toMatchObject({
      providerName: { kind: 'absent' },
      generatedTitle: '运行测试'
    })
    await appendFile(transcriptPath, jsonl(Array.from({ length: 12 }, () => user('继续'))))
    expect((await read()).nameEvidence?.[0]?.generatedTitle).toBe('运行测试')
    await appendFile(
      transcriptPath,
      jsonl([{ type: 'custom-title', customTitle: '继续', sessionId: 'session' }])
    )
    const native = await read()
    const slot = projectSessionNameSlot({
      ...request,
      title: native.titles[0],
      evidence: native.nameEvidence?.[0],
      manualTitle: 'Old manual'
    })!
    expect(slot.providerName).toEqual({
      kind: 'named',
      title: '继续',
      field: 'custom-title.customTitle'
    })
    expect(
      resolveTerminalTabTitle(
        { title: 'Testing step', customTitle: 'Container', aiVaultTitle: slot },
        false
      )
    ).toBe('继续')
    const unavailable = await readAiVaultSessionTitlesFromFiles([
      { ...request, transcriptPath: join(transcriptPath, 'missing.jsonl') }
    ])
    expect(unavailable.nameEvidence?.[0]?.providerName.kind).toBe('unavailable')
    expect(
      projectSessionNameSlot({
        ...request,
        previous: slot,
        evidence: unavailable.nameEvidence?.[0],
        manualTitle: 'Old manual'
      })?.title
    ).toBe('继续')
    const mismatch = await readAiVaultSessionTitlesFromFiles([
      { ...request, sessionId: 'someone-else' }
    ])
    expect(mismatch.titles).toEqual([])
    expect(mismatch.nameEvidence?.[0]?.providerName.kind).toBe('unavailable')
  })

  it('sees index-only Codex renames in a custom profile without touching the transcript', async () => {
    const profile = await root()
    const sessions = join(profile, 'sessions')
    await mkdir(sessions)
    const transcriptPath = join(sessions, 'session.jsonl')
    await writeFile(
      transcriptPath,
      jsonl([
        { type: 'session_meta', payload: { id: 'session', title: 'Stale metadata' } },
        { type: 'event_msg', payload: { type: 'user_message', message: '检查登录异常' } }
      ])
    )
    const indexPath = join(profile, 'session_index.jsonl')
    await writeFile(indexPath, jsonl([{ id: 'session', thread_name: 'Native one' }]))
    const request = { agent: 'codex' as const, sessionId: 'session', transcriptPath }
    const first = await readAiVaultSessionTitlesFromFiles([request])
    expect(first.nameEvidence?.[0]).toMatchObject({
      providerName: { kind: 'named', title: 'Native one' },
      generatedTitle: '检查登录异常'
    })
    await appendFile(indexPath, jsonl([{ id: 'session', thread_name: 'Native two renamed' }]))
    const next = await readAiVaultSessionTitlesFromFiles([request])
    expect(next.nameEvidence?.[0]?.providerName).toMatchObject({
      kind: 'named',
      title: 'Native two renamed'
    })
    const slot = projectSessionNameSlot({
      ...request,
      title: next.titles[0],
      evidence: next.nameEvidence?.[0],
      manualTitle: 'Old manual'
    })!
    expect(
      resolveTerminalTabTitle({ title: 'Live title', customTitle: null, aiVaultTitle: slot }, false)
    ).toBe('Native two renamed')
  })
})
