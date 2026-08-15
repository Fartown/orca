// 「这一轮结束了没有」的判定,抽成纯函数:喂事件进去,吐状态和结论出来。
//
// 为什么单独成一个模块:这段逻辑有 5 种出口、4 个时间阈值、还依赖真实时钟,
// 原来长在循环里根本测不到 —— 要驱动它就得把 git、终端、验收全 mock 一遍,还得真 sleep。
// 于是它成了整个守卫里事故最密集的一段(误判空闲注入进权限对话框、等过一次人两道超时
// 就对整轮失效、陈旧状态导致轮次永不结束),而测试只能事后补在「它应该长什么样」上。
//
// 现在时钟和终端观察都留在调用方,这里只做状态推进,可以直接喂事件序列来测。

export const WAIT_DEFAULTS = {
  startMs: 300_000, // 注入后多久还没有任何动静,就认定它没收到
  stuckMs: 20 * 60_000, // 「不在干活」持续多久算卡死。在干活就一直等 —— 长任务腰斩比卡死更糟
  observeGraceMs: 3 * 60_000, // 观察终端连续失败多久才算真的联系不上
  longRunMs: 30 * 60_000 // 跑多久提醒一句「还在干,继续等」
}

/**
 * @param {number} sentAt 注入时刻(注入在此之前已经发出)
 * @param {boolean} injected 这一轮是我们注入的吗。
 *   注入的轮次必须先看到 agent 动起来,才能采信「结束」—— 否则它收尾上一轮时发出的
 *   done 会被当成本轮的结束,一轮 16 秒空转三次就把空转熔断顶开。实测发生过。
 *   attach 的轮次相反:我们本来就是来等它手上那一轮结束的,直接采信。
 */
export function initialWaitState(sentAt, injected = true) {
  return {
    sentAt,
    injected,
    startAt: sentAt, // START_MS 的计时起点,等人的时间要往后顺延
    lastBusyAt: sentAt,
    startedWorking: false,
    waitingSince: null, // 此刻正在等用户确认的起点
    announcedNeedsUser: false,
    longRunNoticed: false,
    observeErrorAt: null,
    observeErrorMessage: null
  }
}

/**
 * 推进一步。
 *
 * @param {object} state 上一步的状态
 * @param {object} event 观察结果:
 *   成功 `{ ok: true, verdict, now, source?, toolName? }`,verdict 来自 classifyRound;
 *   失败 `{ ok: false, message, now }`。
 * @returns {{ state: object, outcome: object, notices: object[] }}
 *   outcome:`{ type: 'wait' }` 继续等 · `{ type: 'done' }` 这一轮结束 ·
 *           `{ type: 'failure', reason }` 判定失败。
 *   notices 是要报给人的事件,由调用方决定怎么呈现 —— 纯函数不碰 I/O。
 */
export function advanceWait(state, event, limits = WAIT_DEFAULTS) {
  const s = { ...state }
  const notices = []
  const now = event.now

  if (!event.ok) {
    // 观察终端要调 orca CLI,偶发失败是常态(Orca 在重启、IPC 抖动、机器刚睡醒)。
    // 一轮要轮询几千次,把任何一次失败当致命,目标迟早死在一次抖动上 —— 实测发生过。
    if (!s.observeErrorAt) {
      s.observeErrorAt = now
      s.observeErrorMessage = event.message
      notices.push({ kind: 'observe-failed', message: event.message })
    }
    if (now - s.observeErrorAt >= limits.observeGraceMs) {
      return {
        state: s,
        outcome: {
          type: 'failure',
          reason: `连续 ${Math.round(limits.observeGraceMs / 60_000)} 分钟观察不到终端:${s.observeErrorMessage}`
        },
        notices
      }
    }
    return { state: s, outcome: { type: 'wait' }, notices }
  }

  if (s.observeErrorAt) {
    notices.push({ kind: 'observe-recovered', outMs: now - s.observeErrorAt })
    s.observeErrorAt = null
    s.observeErrorMessage = null
  }

  if (event.verdict === 'disconnected') {
    return { state: s, outcome: { type: 'failure', reason: '终端已断开' }, notices }
  }

  if (event.verdict === 'needs-user') {
    if (!s.announcedNeedsUser) {
      s.announcedNeedsUser = true
      notices.push({ kind: 'needs-user', toolName: event.toolName })
    }
    s.waitingSince = s.waitingSince ?? now
    return { state: s, outcome: { type: 'wait' }, notices }
  }

  if (s.waitingSince) {
    // 刚从「等你确认」里出来:两道超时都从这一刻重新起算,否则人思考的那段时间
    // 会被算成 agent 没动静。这个标志必须清掉 —— 早先它只置位不复位,
    // 于是本轮只要等过一次人,两道闸门就对整轮永久失效,agent 之后崩掉也没人管。
    s.startAt += now - s.waitingSince
    s.waitingSince = null
    s.announcedNeedsUser = false
    s.lastBusyAt = now
  }

  if (event.verdict === 'busy') {
    s.lastBusyAt = now
    if (!s.startedWorking) {
      s.startedWorking = true
      notices.push({ kind: 'working', source: event.source })
    } else if (!s.longRunNoticed && now - s.sentAt > limits.longRunMs) {
      s.longRunNoticed = true
      notices.push({ kind: 'long-run', minutes: Math.round((now - s.sentAt) / 60_000) })
    }
  }

  // finished 来自本轮的 hook 状态。但注入的轮次要先见它动过 ——
  // 注入刚发出去时它可能还在收尾上一轮,那个 done 不是本轮的结束。
  if (event.verdict === 'finished' && (s.startedWorking || !s.injected)) {
    return { state: s, outcome: { type: 'done' }, notices }
  }
  // quiet 只说明终端安静了 —— 只有确实见它动过,才算这一轮跑完;
  // 否则就是注入刚发出去、agent 还没接管,继续等。
  if (event.verdict === 'quiet' && s.startedWorking) {
    return { state: s, outcome: { type: 'done' }, notices }
  }

  if (!s.startedWorking && now - s.startAt > limits.startMs) {
    return {
      state: s,
      outcome: {
        type: 'failure',
        reason: `注入后 ${Math.round(limits.startMs / 1000)} 秒 agent 毫无动静,可能没收到输入或已退出`
      },
      notices
    }
  }
  // 卡死判定只看「多久没见它动过」。等人不算卡死 —— 上面已经把那段时间还回去了。
  if (now - s.lastBusyAt > limits.stuckMs) {
    return {
      state: s,
      outcome: {
        type: 'failure',
        reason: `agent 已 ${Math.round(limits.stuckMs / 60_000)} 分钟没有任何动静,且这一轮没有结束`
      },
      notices
    }
  }

  return { state: s, outcome: { type: 'wait' }, notices }
}
