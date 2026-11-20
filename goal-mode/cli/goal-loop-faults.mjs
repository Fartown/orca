// 守卫调用失败与驱动自身出错的记账:重试节奏、通知用户、恢复后撤下通知。从 goal-loop.mjs 拆出,行为不变。
import { addNotice, resolveNotices } from './goal-notices.mjs'

export async function guardFailed(run, reason, report, save, { retryMs, intervalMs }) {
  run.guardFailures += 1
  const delay = retryMs[run.guardFailures - 1]
  report.warn(`守卫调用失败(第 ${run.guardFailures} 次):${reason}`)
  if (delay !== undefined) {
    run.guardRetryAt = Date.now() + delay
  } else {
    // 重试用完:通知用户,之后跟着定时唤醒再试,成功即恢复。
    if (run.guardFailures === retryMs.length + 1) {
      run.current = addNotice(
        run.current,
        'guard-unavailable',
        `守卫无法运行:${reason}`,
        Date.now()
      )
    }
    run.guardRetryAt = Date.now() + intervalMs
  }
  run.pendingWake = 'guard-retry'
  await save()
}

export async function noteFault(run, err, report, save, { noticeMs }) {
  const message = err?.message || String(err)
  if (err?.code === 'goal_host_unverifiable') {
    return
  }
  if (!run.faultSince) {
    run.faultSince = Date.now()
    report.warn(`驱动出错,重试中:${message}`)
  }
  if (!run.faultNoticed && Date.now() - run.faultSince >= noticeMs) {
    run.faultNoticed = true
    run.current = {
      ...addNotice(run.current, 'driver-fault', `驱动持续出错:${message}`, Date.now()),
      driverError: { kind: 'round', message: message.slice(0, 500), at: Date.now() }
    }
    await save().catch(() => {})
  }
}

export function clearFault(run, report) {
  if (!run.faultSince) {
    return
  }
  report.warn(`驱动恢复正常(出错持续了 ${Math.round((Date.now() - run.faultSince) / 1000)} 秒)`)
  run.faultSince = null
  run.faultNoticed = false
  run.current = {
    ...resolveNotices(run.current, 'driver-fault', Date.now()),
    driverError: null
  }
}
