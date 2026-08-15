// 渲染注入用的提示词。模板是 prompts/*.md 的原文,这里只做替换和压平。
//
// 模板放在这个包里、不用 `..` 跨出去:它们是运行时按名字读盘的,不是启动时载入的,
// 所以一次目录搬迁就能让跑着的目标在「要注入下一轮」的那一刻 ENOENT 死掉 —— 真发生过。
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ROOT } from './goal-state.mjs'

const PROMPTS_DIR = path.join(import.meta.dirname, 'prompts')
const cache = new Map()

async function loadTemplate(name) {
  if (!cache.has(name)) {
    cache.set(name, await fs.readFile(path.join(PROMPTS_DIR, `${name}.md`), 'utf8'))
  }
  return cache.get(name)
}

/**
 * 压成单行。orca terminal send 把 \n 原样写进 PTY,TUI 会当回车提前提交,
 * 所以多行提示词会被切成好几次提交,agent 只看到第一个片段就开始答。
 */
function flatten(text) {
  return text.replace(/\s+/g, ' ').trim()
}

export async function renderPrompt(name, vars, { flatten: doFlatten = true } = {}) {
  const template = await loadTemplate(name)
  // 残留检查只看模板本身。早先它检查的是替换后的全文,于是**数据里**出现 {{词}} 也会抛 ——
  // 目标写「把模板里的 {{name}} 换成真实值」、或者验收输出里带 Vue/Jinja 语法,
  // 就会每 3 秒抛一次、10 分钟后把目标判成受阻。数据不该有能力炸掉渲染。
  const leftover = template
    .replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? '' : m))
    .match(/\{\{\w+\}\}/)
  if (leftover) {
    throw new Error(`模板 ${name}.md 需要变量 ${leftover[0]},但没有提供`)
  }
  const filled = template.replace(/\{\{(\w+)\}\}/g, (match, k) => String(vars[k] ?? ''))
  return doFlatten ? flatten(filled) : filled.trim()
}

/**
 * 提示词落文件模式:保住原排版,注入的只有一行指针。
 * 代价是 agent 要多一次读取,而且它可能不读 —— 所以默认不开。
 */
export async function writePromptFile(key, turn, body) {
  const dir = path.join(ROOT, 'prompts')
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${key}-turn${turn}.md`)
  await fs.writeFile(file, `${body}\n`, 'utf8')
  return file
}

export function promptPointerLine(file) {
  return `目标模式看门狗发来本轮指令。请先完整读取 ${file} 这个文件,然后严格按其中的内容执行。该文件由看门狗生成,不要修改它。`
}
