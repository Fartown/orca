// 驱动侧的合作式控制:读宿主写下的意图文件,在检查点上确认并落收据。
//
// 宿主和驱动之间只有两个文件:control.json(宿主写、驱动读)和收据(宿主先写 accepted,
// 驱动改写成 applied)。驱动永远不写目标记录,宿主永远不写运行状态 —— 两个写者不碰同一份数据。
// 暂停只关闭「下一次注入」;停止在此基础上再请求中断在途的一轮,并如实写明哪部分得到了确认;
// reload 表示记录被宿主改过(编辑/换会话),驱动在下一个安全点重新读入。
import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * @param {object} options
 * @param {string} options.controlPath 宿主写的意图文件
 * @param {string} [options.recordPath] 宿主写的 v2 记录,reload 时重读
 * @param {(clientOperationId: string) => string} options.receiptPathFor 收据文件位置
 * @param {string} options.runId 本次运行代际;写进收据,迟到的控制不会冒充别的运行
 * @param {(message: string) => void} [options.log]
 * @param {() => number} [options.now]
 */
export function createDriverControl({
  controlPath,
  recordPath,
  receiptPathFor,
  runId,
  log,
  now = Date.now
}) {
  let appliedOperationId = null
  let continuation = 'enabled'
  let stopOperationId = null
  let reloadOperationId = null
  let pendingReload = null

  /**
   * @param {string} phase 'before-inject' | 'waiting-round' | 'awaiting-user' | 'retry-backoff'
   * @returns {Promise<'run'|'paused'|'stop'>}
   */
  async function checkpoint(phase) {
    const intent = await readIntent(controlPath)
    if (intent && intent.clientOperationId !== appliedOperationId) {
      appliedOperationId = intent.clientOperationId
      continuation = intent.continuation
      const action = intent.action ?? (intent.continuation === 'paused' ? 'pause' : 'resume')
      if (action === 'stop') {
        stopOperationId = intent.clientOperationId
        await writeReceipt(intent, {
          status: 'applying',
          code: 'ok',
          message:
            'Stop requested; the gate is closed and the round in flight is being interrupted.',
          continuationPaused: true
        })
        log?.(`宿主要求停止(${phase}):不再注入,准备中断在途轮次`)
      } else if (action === 'reload') {
        reloadOperationId = intent.clientOperationId
        pendingReload = recordPath ? await readJson(recordPath) : null
        await writeReceipt(intent, {
          status: 'applying',
          code: 'ok',
          message: 'Definition received; the driver applies it before the next injection.',
          continuationPaused: intent.continuation === 'paused'
        })
        log?.(`宿主改了目标定义(${phase}),下一个安全点套用`)
      } else {
        await writeReceipt(intent, {
          status: 'applied',
          code: 'ok',
          message: describe(intent.continuation, phase),
          continuationPaused: intent.continuation === 'paused'
        })
        log?.(
          intent.continuation === 'paused'
            ? `宿主要求暂停续跑(${phase}),已确认:不再注入下一轮`
            : `宿主要求恢复续跑(${phase}),已确认`
        )
      }
    }
    if (stopOperationId) {
      return 'stop'
    }
    return continuation === 'paused' ? 'paused' : 'run'
  }

  /** 循环在安全点取走待套用的记录;取一次就清空。 */
  function takeReload() {
    const record = pendingReload
    pendingReload = null
    return record
  }

  /** 循环把记录套用并落盘之后才算 applied。 */
  async function confirmReload() {
    if (!reloadOperationId) {
      return
    }
    await patchReceipt(reloadOperationId, {
      status: 'applied',
      message: 'Definition applied; the next injection uses it.',
      appliedAt: now()
    })
    reloadOperationId = null
  }

  /**
   * 停止收尾:只写驱动真正确认了的部分。turnStopped 为 null 表示当时没有在途轮次,
   * false 表示中断已发出但没等到本轮结束的证据 —— 那就是 confirmation_pending,不冒充停了。
   */
  async function confirmStop({ turnStopped, acceptanceStopped }) {
    if (!stopOperationId) {
      return
    }
    const confirmed = turnStopped !== false
    await patchReceipt(stopOperationId, {
      status: 'applied',
      code: confirmed ? 'ok' : 'confirmation_pending',
      message: confirmed
        ? turnStopped === null
          ? 'Stopped; no round was in flight.'
          : 'Stopped; the round in flight ended after the interrupt.'
        : 'Stopped injecting, but the interrupted round has not confirmed it ended.',
      runId,
      continuationPaused: true,
      turnStopped,
      acceptanceStopped,
      appliedAt: now()
    })
    stopOperationId = null
  }

  async function writeReceipt(intent, fields) {
    const file = receiptPathFor(intent.clientOperationId)
    const existing = await readJson(file)
    // 宿主还没来得及写 accepted 的话,这里只补一份最小收据;宿主写入用 rename,不会互相撕裂。
    await writeJsonAtomic(file, {
      clientOperationId: intent.clientOperationId,
      goalId: existing?.goalId ?? null,
      payloadFingerprint: existing?.payloadFingerprint ?? '0'.repeat(64),
      acceptedAt: existing?.acceptedAt ?? now(),
      turnStopped: existing?.turnStopped ?? null,
      acceptanceStopped: existing?.acceptanceStopped ?? null,
      ...existing,
      ...fields,
      runtimeFence: intent.runtimeFence,
      runId,
      appliedAt: fields.status === 'applied' ? now() : (existing?.appliedAt ?? null)
    })
  }

  async function patchReceipt(clientOperationId, fields) {
    const file = receiptPathFor(clientOperationId)
    const existing = (await readJson(file)) ?? { clientOperationId }
    await writeJsonAtomic(file, { ...existing, ...fields })
  }

  return { checkpoint, takeReload, confirmReload, confirmStop }
}

function describe(continuation, phase) {
  if (continuation === 'paused') {
    return phase === 'before-inject'
      ? 'Continuation paused before the next injection.'
      : 'Continuation paused; the round already in flight will finish on its own.'
  }
  return 'Continuation resumed.'
}

async function readIntent(file) {
  const raw = await readJson(file)
  if (
    !raw ||
    typeof raw.clientOperationId !== 'string' ||
    (raw.continuation !== 'paused' && raw.continuation !== 'enabled') ||
    !Number.isInteger(raw.runtimeFence)
  ) {
    return null
  }
  return raw
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null // 没有、写了一半、被人改坏:都当作「没有新意图」,下一次检查点再看
  }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, file)
}
