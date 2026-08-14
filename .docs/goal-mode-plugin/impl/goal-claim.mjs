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

/** 每轮注入前清空 —— 否则上一轮的声明会被当成这一轮的。 */
export async function clearClaim(key) {
  await fs.rm(claimPath(key), { force: true })
}

export async function readClaim(key) {
  let raw
  try {
    raw = await fs.readFile(claimPath(key), 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null
    }
    throw err
  }
  for (const line of raw.split('\n')) {
    // 半角/全角冒号都收;agent 可能顺手加了 markdown 强调或引号。
    const m = line.match(/^\s*["'`*_]*\s*(complete|blocked)\s*["'`*_]*\s*[:：]\s*(.*)$/i)
    if (m) {
      return { kind: m[1].toLowerCase(), summary: m[2].trim().slice(0, 300) }
    }
  }
  return { kind: 'malformed', summary: raw.trim().slice(0, 200) }
}
