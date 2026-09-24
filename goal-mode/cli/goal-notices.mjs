// 需要用户知道的事写进目标记录,由客户端拉取后发系统通知。执行主机不弹通知:SSH 下那会弹在远端。
// 纯函数,不碰 I/O。

export const NOTICE_LIMIT = 20
const NOTIFIED_QUESTION_LIMIT = 50

/** kind:question / guard-unavailable / driver-fault / complete / budget。枚举只在这里,线上一律是字符串。 */
export function addNotice(goal, kind, text, now) {
  const notices = goal.notices || []
  const notice = {
    id: `${kind}:${now}:${notices.length}`,
    kind,
    text: String(text).slice(0, 1_000),
    at: now,
    resolvedAt: null
  }
  return { ...goal, notices: [...notices, notice].slice(-NOTICE_LIMIT) }
}

/** 事情已经过去(问题答了、守卫恢复了),对应的通知失效,客户端不再补发。 */
export function resolveNotices(goal, kind, now) {
  const notices = goal.notices || []
  if (!notices.some((notice) => notice.kind === kind && !notice.resolvedAt)) {
    return goal
  }
  return {
    ...goal,
    notices: notices.map((notice) =>
      notice.kind === kind && !notice.resolvedAt ? { ...notice, resolvedAt: now } : notice
    )
  }
}

/**
 * 守卫的 question 是「当前仍待用户回答的问题」:没解决就一直原文保留,空了才清除。
 * 同一个问题在一个目标里只通知一次 —— 换轮、换个问题再换回来、驱动重启都不重发。
 */
export function applyQuestion(goal, question, now) {
  const text = String(question || '').trim()
  const current = goal.awaitingUser?.reason ?? null
  if (!text) {
    return current ? resolveNotices({ ...goal, awaitingUser: null }, 'question', now) : goal
  }
  if (text === current) {
    return goal
  }
  let next = { ...goal, awaitingUser: { reason: text, since: now } }
  if (current) {
    next = resolveNotices(next, 'question', now)
  }
  const notified = goal.notifiedQuestions || []
  if (notified.includes(text)) {
    return next
  }
  next = { ...next, notifiedQuestions: [...notified, text].slice(-NOTIFIED_QUESTION_LIMIT) }
  return addNotice(next, 'question', text, now)
}
