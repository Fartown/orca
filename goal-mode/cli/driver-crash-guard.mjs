// 驱动进程的最后一道兜底。
//
// 没有它的时候,一个未捕获异常会让进程静默消失,而目标记录还停在 active ——
// 面板只能显示「中断了(驱动已退出)」,说不出为什么,日志里也只有半截堆栈。
// 这里不试图「扛过去继续跑」:异常之后进程状态是未知的,硬撑比停下更危险。
// 它做的是把死因写进记录,让这次崩溃变成一个能接回的中断,而不是一桩悬案。
import { readGoal, writeGoal } from './goal-state.mjs'

/** @param {string} key 目标 key @param {(msg: string) => void} log 写驱动日志 */
export function installCrashGuard(key, { log = console.error, exit = process.exit } = {}) {
  let firing = false

  const die = (kind) => async (err) => {
    if (firing) {
      return // 兜底自己再抛就别递归了
    }
    firing = true
    log(`\n驱动进程异常退出(${kind}):${err?.stack || err?.message || String(err)}`)
    await recordDriverError(key, kind, err).catch(() => {})
    exit(1)
  }

  process.on('uncaughtException', die('uncaughtException'))
  process.on('unhandledRejection', die('unhandledRejection'))
}

/**
 * 只补一条死因,不动 state。
 * 状态仍然是 active:agent 很可能还在干活,这只是看门狗掉线了 ——
 * 面板据此显示「中断了 → 接回」,而不是把目标判成失败。
 */
async function recordDriverError(key, kind, err) {
  const goal = await readGoal(key)
  if (!goal) {
    return
  }
  await writeGoal({
    ...goal,
    driverError: { kind, message: String(err?.message || err).slice(0, 500), at: Date.now() }
  })
}
