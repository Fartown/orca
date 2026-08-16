// agent 声明「完成 / 受阻」的通道。
//
// 为什么用文件而不是扫终端输出:实测 agent TUI 在 alt-screen 里原地重绘,
// orca terminal read 只给得到当前可见屏(约 33 行)且 --cursor 不推进,
// 一旦 agent 的回答长一点,我们注入的文本连同任何轮次标记都会被顶出可见区。
// 那样就没法把 agent 的声明和我们自己提示词里的回显区分开 —— 会自触发假完成。
// 认领文件没有折行、滚屏、ANSI 这些问题,而且放在工作区之外,不会污染内容指纹。
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ROOT } from './goal-state.mjs'

export const claimPath = (key) => path.join(ROOT, 'claims', `${key}.txt`)

// agent 可能把命令输出重定向进这个路径(每轮都告诉它路径),整份读进来能到几百 MB。
// 声明本身只有一行,超过这个量的一定不是声明。
const MAX_CLAIM_BYTES = 64 * 1024

/** 每轮注入前清空 —— 否则上一轮的声明会被当成这一轮的。 */
export async function clearClaim(key) {
  // recursive:agent 手滑 mkdir 出这个路径时,不带它会每轮抛 EISDIR、十分钟后把目标判受阻。
  await fs.rm(claimPath(key), { force: true, recursive: true })
}

/**
 * @param {number} after 本轮的观察起点。早于它写下的声明不属于这一轮。
 *   注入的轮次靠 clearClaim 保证这点,但**接管**的轮次不注入也就不清 ——
 *   上一轮留下的声明会被当成刚写的,每一轮重新裁决一次同一句话。
 *   实测:agent 说了一次「受阻」,守卫停下等人;人回话后它接管、结束、
 *   又读到那句九小时前的「受阻」,再停下等人 —— 每 45 秒一圈,agent 正常干活却永远推不动。
 *   接管的轮次不能靠清文件解决:那一轮是半路挂上去的,清掉就等于删一份我们没资格删的声明。
 */
export async function readClaim(key, { after = 0 } = {}) {
  let raw
  try {
    const stat = await fs.stat(claimPath(key))
    if (stat.isDirectory()) {
      return { kind: 'malformed', summary: '认领路径是个目录' }
    }
    if (stat.mtimeMs < after) {
      return { kind: 'stale', ageMs: after - stat.mtimeMs }
    }
    if (stat.size > MAX_CLAIM_BYTES) {
      return {
        kind: 'malformed',
        summary: `认领文件有 ${Math.round(stat.size / 1024)} KB,声明只该有一行`
      }
    }
    raw = await fs.readFile(claimPath(key), 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null
    }
    throw err
  }
  for (const line of raw.split('\n')) {
    // 半角/全角冒号都收;agent 可能顺手加了 markdown 强调或引号。
    // 区分大小写:`Complete: 5 files changed, 12 insertions` 这种日志行原来会被当成完成声明,
    // 没配验收时它足以让目标直接判成「达成(未经验证)」。约定就是小写开头。
    const m = line.match(/^\s*["'`*_]*\s*(complete|blocked)\s*["'`*_]*\s*[:：]\s*(.*)$/)
    if (m) {
      return { kind: m[1].toLowerCase(), summary: m[2].trim().slice(0, 300) }
    }
  }
  return { kind: 'malformed', summary: raw.trim().slice(0, 200) }
}
