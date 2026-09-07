// 合作式控制:意图文件 → 检查点 → 收据。零 mock,只用临时目录。
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createDriverControl } from './goal-driver-control.mjs'

async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), 'goal-control-'))
  const controlPath = path.join(dir, 'control.json')
  const receiptPathFor = (id) => path.join(dir, 'operations', `${id}.json`)
  const logs = []
  const control = createDriverControl({
    controlPath,
    receiptPathFor,
    runId: 'run-1',
    log: (line) => logs.push(line),
    now: () => 1_700_000_000_000
  })
  return { dir, controlPath, receiptPathFor, control, logs }
}

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))

test('没有意图文件时一路放行,不写任何收据', async () => {
  const { dir, control, receiptPathFor } = await setup()
  try {
    assert.equal(await control.checkpoint('before-inject'), 'run')
    assert.equal(await control.checkpoint('waiting-round'), 'run')
    await assert.rejects(readFile(receiptPathFor('nothing'), 'utf8'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('暂停意图在注入前的检查点被确认,收据从 accepted 改写成 applied', async () => {
  const { dir, controlPath, control, receiptPathFor, logs } = await setup()
  try {
    await mkdir(path.dirname(receiptPathFor('op-1')), { recursive: true })
    await writeFile(
      receiptPathFor('op-1'),
      JSON.stringify({
        clientOperationId: 'op-1',
        goalId: 'goal-1',
        payloadFingerprint: 'f'.repeat(64),
        status: 'accepted',
        code: 'ok',
        message: 'Pause requested',
        runtimeFence: 3,
        runId: 'run-1',
        continuationPaused: null,
        turnStopped: null,
        acceptanceStopped: null,
        acceptedAt: 1,
        appliedAt: null
      })
    )
    await writeFile(
      controlPath,
      JSON.stringify({
        runtimeFence: 3,
        continuation: 'paused',
        clientOperationId: 'op-1',
        requestedAt: 2
      })
    )

    assert.equal(await control.checkpoint('before-inject'), 'paused')
    const receipt = await readJson(receiptPathFor('op-1'))
    assert.equal(receipt.status, 'applied')
    assert.equal(receipt.continuationPaused, true)
    assert.equal(receipt.runtimeFence, 3)
    assert.equal(receipt.runId, 'run-1')
    assert.equal(receipt.goalId, 'goal-1') // 宿主写的字段原样保留
    assert.equal(receipt.appliedAt, 1_700_000_000_000)
    assert.match(logs.at(-1), /暂停/)

    // 同一份意图不重复确认;继续暂停。
    assert.equal(await control.checkpoint('waiting-round'), 'paused')
    assert.equal(logs.length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('在途轮次中收到暂停:收据写明本轮照常结束;随后恢复意图放行', async () => {
  const { dir, controlPath, control, receiptPathFor } = await setup()
  try {
    await writeFile(
      controlPath,
      JSON.stringify({
        runtimeFence: 1,
        continuation: 'paused',
        clientOperationId: 'op-p',
        requestedAt: 1
      })
    )
    assert.equal(await control.checkpoint('waiting-round'), 'paused')
    const paused = await readJson(receiptPathFor('op-p'))
    assert.match(paused.message, /in flight/)
    assert.equal(paused.payloadFingerprint, '0'.repeat(64)) // 宿主还没写 accepted 时的最小收据

    await writeFile(
      controlPath,
      JSON.stringify({
        runtimeFence: 2,
        continuation: 'enabled',
        clientOperationId: 'op-r',
        requestedAt: 2
      })
    )
    assert.equal(await control.checkpoint('before-inject'), 'run')
    const resumed = await readJson(receiptPathFor('op-r'))
    assert.equal(resumed.status, 'applied')
    assert.equal(resumed.continuationPaused, false)
    assert.equal(resumed.runtimeFence, 2)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('意图文件写坏了当作没有新意图,下次检查点再看', async () => {
  const { dir, controlPath, control } = await setup()
  try {
    await writeFile(controlPath, '{"continuation": "pau')
    assert.equal(await control.checkpoint('before-inject'), 'run')
    await writeFile(controlPath, JSON.stringify({ continuation: 'paused' })) // 缺 clientOperationId
    assert.equal(await control.checkpoint('before-inject'), 'run')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('停止:先记 applying,循环确认后才 applied;等不到本轮结束就是 confirmation_pending', async () => {
  const { dir, controlPath, control, receiptPathFor } = await setup()
  try {
    await writeFile(
      controlPath,
      JSON.stringify({
        runtimeFence: 4,
        continuation: 'paused',
        action: 'stop',
        clientOperationId: 'op-s',
        requestedAt: 1
      })
    )
    assert.equal(await control.checkpoint('waiting-round'), 'stop')
    const applying = await readJson(receiptPathFor('op-s'))
    assert.equal(applying.status, 'applying')
    assert.equal(applying.continuationPaused, true)

    await control.confirmStop({ turnStopped: false, acceptanceStopped: null })
    const done = await readJson(receiptPathFor('op-s'))
    assert.equal(done.status, 'applied')
    assert.equal(done.code, 'confirmation_pending')
    assert.equal(done.turnStopped, false)
    assert.equal(done.runId, 'run-1')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('reload:取走记录、循环套用后确认', async () => {
  const { dir, controlPath, control, receiptPathFor } = await setup()
  try {
    const recordPath = path.join(dir, 'record.json')
    await writeFile(recordPath, JSON.stringify({ goalId: 'g', specRevision: 2 }))
    const withRecord = createDriverControl({
      controlPath,
      recordPath,
      receiptPathFor,
      runId: 'run-1',
      now: () => 7
    })
    await writeFile(
      controlPath,
      JSON.stringify({
        runtimeFence: 5,
        continuation: 'paused',
        action: 'reload',
        clientOperationId: 'op-l',
        requestedAt: 1
      })
    )
    assert.equal(await withRecord.checkpoint('before-inject'), 'paused')
    assert.equal((await readJson(receiptPathFor('op-l'))).status, 'applying')
    assert.deepEqual(withRecord.takeReload(), { goalId: 'g', specRevision: 2 })
    assert.equal(withRecord.takeReload(), null)
    await withRecord.confirmReload()
    assert.equal((await readJson(receiptPathFor('op-l'))).status, 'applied')
    void control
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
