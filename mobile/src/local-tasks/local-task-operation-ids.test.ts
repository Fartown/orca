import { describe, expect, it } from 'vitest'
import { markRpcDeliveryUnknown } from '../transport/rpc-delivery-ambiguity'
import type { RpcResponse } from '../transport/types'
import { createLocalTasksApi } from './local-tasks-api'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'

const createdTask = {
  id: 't1',
  projectId: 'p1',
  number: 1,
  ref: 'SHOP-1',
  title: 'Export CSV',
  description: '',
  criteria: [],
  statusId: 's1',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

/** A desktop that drops the first answer after the frame left, then answers the resend. */
function flakyDesktop(replies: (() => Promise<RpcResponse>)[]) {
  const ids: unknown[] = []
  const port = {
    sendRequest: (_method: string, params?: unknown): Promise<RpcResponse> => {
      ids.push(
        typeof params === 'object' && params !== null
          ? Reflect.get(params, 'clientOperationId')
          : undefined
      )
      const next = replies.shift()
      if (!next) {
        throw new Error('no reply scripted')
      }
      return next()
    }
  }
  return { ids, api: createLocalTasksApi(port) }
}

const lost = () => Promise.reject(markRpcDeliveryUnknown(new Error('socket closed')))
const created = () =>
  Promise.resolve<RpcResponse>({ id: 'r', ok: true, result: { ok: true, task: createdTask } })
const refused = () =>
  Promise.resolve<RpcResponse>({ id: 'r', ok: true, result: { ok: false, code: 'parent_invalid' } })

describe('clientOperationId across resends', () => {
  const payload = { projectId: 'p1', title: 'Export CSV' }

  it('resends a write whose answer was lost under the same id, so the desktop applies it once', async () => {
    const desktop = flakyDesktop([lost, created])
    const operation = createLocalTaskOperationIds()
    const first = await sendLocalTaskWrite(operation, payload, desktop.api.createTask)
    expect(first.kind).toBe('unknown')
    const second = await sendLocalTaskWrite(operation, payload, desktop.api.createTask)
    expect(second.kind).toBe('ok')
    expect(desktop.ids[0]).toEqual(expect.any(String))
    expect(desktop.ids[1]).toBe(desktop.ids[0])
  })

  it('starts a new operation after a definite answer, even with the same payload', async () => {
    const desktop = flakyDesktop([created, refused, created])
    const operation = createLocalTaskOperationIds()
    await sendLocalTaskWrite(operation, payload, desktop.api.createTask)
    await sendLocalTaskWrite(operation, payload, desktop.api.createTask)
    await sendLocalTaskWrite(operation, payload, desktop.api.createTask)
    expect(new Set(desktop.ids).size).toBe(3)
  })

  it('does not reuse an unsettled id for a payload the user has since changed', async () => {
    const desktop = flakyDesktop([lost, created])
    const operation = createLocalTaskOperationIds()
    await sendLocalTaskWrite(operation, payload, desktop.api.createTask)
    await sendLocalTaskWrite(operation, { ...payload, title: 'Export TSV' }, desktop.api.createTask)
    expect(desktop.ids[1]).not.toBe(desktop.ids[0])
  })
})
