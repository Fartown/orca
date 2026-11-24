import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DurableChatOutbox } from './durable-chat-outbox'
import { DurableChatSubmitter } from './durable-chat-submitter'
import type { DurableChatPrepareArgs } from '../../shared/native-chat-view-recovery/durable-chat-submit'
import type { RuntimeRpcResponse } from '../../shared/remote-runtime/rpc/runtime-rpc-envelope'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((p) => rm(p, { recursive: true, force: true })))
})

function prompt(): DurableChatPrepareArgs {
  return {
    id: randomUUID(),
    paneKey: 'tab:leaf',
    ptyId: 'pty-1',
    sessionId: 'codex-session',
    text: 'root-cause delivery test',
    imagePaths: ['/remote/image.png'],
    clearInput: '\x15',
    sentAt: 1000,
    afterMessageId: 'old-turn',
    afterMessageTimestamp: 100
  }
}

const accepted: RuntimeRpcResponse<unknown> = {
  id: 'rpc',
  ok: true,
  _meta: { runtimeId: 'runtime-1' },
  result: {
    send: {
      accepted: true,
      prompt: {
        stages: ['input_accepted'],
        chatTranscript: {
          sessionId: 'codex-session',
          afterMessageId: 'old-turn',
          afterByteOffset: 100,
          transcriptPath: '/fixture/transcript.jsonl',
          fileIdentity: 'dev:ino',
          boundaryFingerprint: 'boundary',
          empty: false,
          submittedAt: 100
        }
      }
    }
  }
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'orca-chat-outbox-'))
  directories.push(dir)
  const path = join(dir, 'outbox.json')
  const store = new DurableChatOutbox(path)
  const deps = {
    prepare: vi.fn(async () => ({
      terminal: 'term-1',
      hostPtyId: 'host-pty',
      processIncarnation: 'inc-1',
      environmentId: 'mini',
      pairingRevision: 7,
      runtimeId: 'runtime-1',
      executionHostId: 'runtime:mini'
    })),
    call: vi
      .fn<(...args: unknown[]) => Promise<RuntimeRpcResponse<unknown>>>()
      .mockImplementation(async (_record, _method, params) =>
        params && typeof params === 'object' && 'verifyChatTranscript' in params
          ? {
              id: 'rpc',
              ok: true,
              _meta: { runtimeId: 'runtime-1' },
              result: { chatTranscriptVerified: true }
            }
          : accepted
      ),
    changed: vi.fn()
  }
  return { path, store, deps, submitter: new DurableChatSubmitter(store, deps) }
}

describe('durable terminal Chat submissions', () => {
  it('waits for an in-flight send before using its one contact query to recover a lost receipt', async () => {
    const f = await fixture(),
      input = prompt()
    await f.submitter.prepare(input)
    let release = () => {}
    let entered = () => {}
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const pendingSend = new Promise<void>((resolve) => {
      release = resolve
    })
    f.deps.call.mockImplementation(async (_record, method) => {
      if (method === 'terminal.send') {
        entered()
        await pendingSend
        throw new Error('lost response after committed host send')
      }
      return { ...accepted, result: { state: 'completed', receipt: accepted.result } }
    })
    const send = f.submitter.dispatch(input.id)
    await started
    const query = f.submitter.query(input.id)
    await Promise.resolve()
    expect(f.deps.call).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([send, query])
    expect(f.deps.call.mock.calls.map((call) => call[1])).toEqual([
      'terminal.send',
      'orchestration.requestShow'
    ])
    expect(f.deps.call.mock.calls[1][2]).toEqual({ request: input.id })
    expect(await f.submitter.list(input.paneKey)).toMatchObject([
      { id: input.id, state: 'input_accepted', text: input.text }
    ])
  })
  it('reconciles the latest durable state atomically when the renderer snapshot misses a concurrent identical send', async () => {
    const f = await fixture(),
      first = prompt(),
      second = { ...prompt(), text: first.text }
    await f.submitter.prepare(first)
    await f.submitter.dispatch(first.id)
    await f.submitter.prepare(second)
    await f.submitter.dispatch(second.id)
    const evidence = { id: 'only-row', transcriptOrder: 200, text: first.text, imageCount: 1 }
    const changes = f.deps.changed.mock.calls.length
    await f.submitter.confirm(first.paneKey, first.sessionId, [evidence])
    expect(await f.submitter.list(first.paneKey)).toHaveLength(2)
    expect(f.deps.changed).toHaveBeenCalledTimes(changes)
    await f.submitter.confirm(first.paneKey, first.sessionId, [
      evidence,
      { ...evidence, id: 'second-row', transcriptOrder: 300 }
    ])
    expect(await f.submitter.list(first.paneKey)).toEqual([])
    const settled = f.deps.changed.mock.calls.length
    await f.submitter.confirm(first.paneKey, first.sessionId, [evidence])
    expect(f.deps.changed).toHaveBeenCalledTimes(settled)
  })

  it('retains an apparent transcript match when the host cannot verify the original file generation', async () => {
    const f = await fixture(),
      input = prompt()
    await f.submitter.prepare(input)
    await f.submitter.dispatch(input.id)
    f.deps.call.mockResolvedValue({
      id: 'rpc',
      ok: true,
      _meta: { runtimeId: 'runtime-1' },
      result: { chatTranscriptVerified: false }
    })
    await f.submitter.confirm(input.paneKey, input.sessionId, [
      { id: 'reencoded-history', transcriptOrder: 1000, text: input.text, imageCount: 1 }
    ])
    expect(await f.submitter.list(input.paneKey)).toMatchObject([
      { id: input.id, text: input.text, imagePaths: input.imagePaths }
    ])
  })

  it('fsyncs the exact input and owner before dispatch and survives a new store instance', async () => {
    const f = await fixture(),
      input = prompt()
    await f.submitter.prepare(input)
    expect(f.deps.call).not.toHaveBeenCalled()
    expect(JSON.parse(await readFile(f.path, 'utf8'))).toMatchObject([
      { ...input, state: 'prepared', processIncarnation: 'inc-1' }
    ])
    const reopened = new DurableChatSubmitter(new DurableChatOutbox(f.path), f.deps)
    expect(await reopened.list(input.paneKey)).toMatchObject([{ ...input, state: 'prepared' }])
    await reopened.dispatch(input.id)
    expect(f.deps.call).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ state: 'dispatching' }),
      'terminal.send',
      expect.objectContaining({
        text: input.text,
        enter: true,
        agentPrompt: true,
        chatComposer: {
          expectedSessionId: input.sessionId,
          clearInput: '\x15',
          imagePaths: input.imagePaths,
          expectedPtyId: 'host-pty',
          expectedIncarnation: 'inc-1'
        }
      }),
      input.id
    )
    expect(await reopened.list(input.paneKey)).toMatchObject([{ state: 'input_accepted' }])
  })

  it('does not dispatch again after lost ACK, reload, absent query or repeated dispatch clicks', async () => {
    const f = await fixture(),
      input = prompt()
    await f.submitter.prepare(input)
    f.deps.call.mockRejectedValueOnce(new Error('ACK lost'))
    await f.submitter.dispatch(input.id)
    const reopened = new DurableChatSubmitter(new DurableChatOutbox(f.path), f.deps)
    f.deps.call.mockResolvedValueOnce({ ...accepted, result: { state: 'absent' } })
    await reopened.query(input.id)
    await Promise.all([reopened.dispatch(input.id), reopened.dispatch(input.id)])
    expect(f.deps.call.mock.calls.map((call) => call[1])).toEqual([
      'terminal.send',
      'orchestration.requestShow'
    ])
    expect(await reopened.list(input.paneKey)).toMatchObject([
      { text: input.text, state: 'unconfirmed', id: input.id }
    ])
  })

  it('queries the original ID and keeps accepted distinct from transcript confirmation', async () => {
    const f = await fixture(),
      input = prompt()
    await f.submitter.prepare(input)
    f.deps.call.mockRejectedValueOnce(new Error('ACK lost'))
    await f.submitter.dispatch(input.id)
    f.deps.call.mockResolvedValueOnce({
      ...accepted,
      result: { state: 'completed', receipt: accepted.result }
    })
    await f.submitter.query(input.id)
    expect(f.deps.call).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: input.id }),
      'orchestration.requestShow',
      { request: input.id }
    )
    expect(await f.submitter.list(input.paneKey)).toMatchObject([{ state: 'input_accepted' }])
    await f.submitter.confirm(input.paneKey, 'different-session', [
      { id: 'user-1', transcriptOrder: 100, text: input.text, imageCount: input.imagePaths.length }
    ])
    expect(await f.submitter.list(input.paneKey)).toHaveLength(1)
    await f.submitter.confirm(input.paneKey, input.sessionId, [
      { id: 'user-1', transcriptOrder: 100, text: input.text, imageCount: input.imagePaths.length }
    ])
    expect(await f.submitter.list(input.paneKey)).toEqual([])
    expect(await new DurableChatOutbox(f.path).list()).toEqual([])
  })

  it('keeps an orphaned dispatching operation unknown after process restart without resending', async () => {
    const f = await fixture(),
      input = prompt()
    await f.submitter.prepare(input)
    await f.store.update((entries) => entries.map((r) => ({ ...r, state: 'dispatching' })))
    const reopened = new DurableChatSubmitter(new DurableChatOutbox(f.path), f.deps)
    await reopened.dispatch(input.id)
    expect(f.deps.call).not.toHaveBeenCalled()
    f.deps.call.mockResolvedValueOnce({ ...accepted, result: { state: 'pending' } })
    await reopened.query(input.id)
    expect(await reopened.list(input.paneKey)).toMatchObject([{ state: 'unconfirmed' }])
  })

  it('retains definite refusals without replacing them on another send of identical text', async () => {
    const f = await fixture(),
      first = prompt(),
      second = { ...prompt(), text: first.text }
    f.deps.call.mockResolvedValue({ ...accepted, result: { send: { accepted: false } } })
    await f.submitter.prepare(first)
    await f.submitter.dispatch(first.id)
    await f.submitter.prepare(second)
    expect(await f.submitter.list(first.paneKey)).toMatchObject([
      { id: first.id, state: 'rejected' },
      { id: second.id, state: 'prepared' }
    ])
  })

  it('refuses overwriting duplicate IDs and corrupt durable data; never opens dispatch', async () => {
    const f = await fixture(),
      input = prompt()
    await f.submitter.prepare(input)
    await expect(f.submitter.prepare({ ...input, text: 'changed' })).rejects.toThrow(
      'already exists'
    )
    await writeFile(f.path, 'corrupt-data')
    await expect(f.submitter.prepare(prompt())).rejects.toThrow()
    expect(await readFile(f.path, 'utf8')).toBe('corrupt-data')
    expect(f.deps.call).not.toHaveBeenCalled()
  })
})
