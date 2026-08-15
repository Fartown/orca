// 提示词模板是运行时按名字读盘的 —— 缺一个,目标就在「要注入下一轮」的那一刻死掉。
// 真发生过:一次目录搬迁把 prompts/ 挪到了别处,跑了两个多小时的目标在验收驳回后
// 要注入 rejected-completion 时 ENOENT,整个驱动进程随之退出。
// 当时 137 个测试全绿,因为没有一个真的去磁盘读过模板。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { renderPrompt } from './continuation-prompt.mjs'

// 循环能请求的全部模板名,和 goal-loop.mjs 里的 pending.name 一一对应。
const USED = [
  'continuation',
  'rejected-completion',
  'tamper-challenge',
  'objective-reminder',
  'objective-updated',
  'budget-limit'
]

test('每个模板都真的能从磁盘读出来并渲染完整', async () => {
  for (const name of USED) {
    // 变量表从模板自身抽,免得测试和模板各写各的、漏了也发现不了
    const raw = await readFile(path.join(import.meta.dirname, 'prompts', `${name}.md`), 'utf8')
    const vars = {}
    for (const m of raw.matchAll(/\{\{(\w+)\}\}/g)) {
      vars[m[1]] = 'X'
    }
    const text = await renderPrompt(name, vars)
    assert.ok(text.length > 0, `${name} 渲染结果为空`)
    assert.ok(!text.includes('{{'), `${name} 渲染后还留着未替换的占位符`)
  }
})

test('模板目录和代码同处一个包 —— 别再用 .. 跨出去', async () => {
  const src = await readFile(new URL('./continuation-prompt.mjs', import.meta.url), 'utf8')
  const line = src.match(/PROMPTS_DIR = .*/)[0]
  assert.ok(!line.includes("'..'"), `模板路径不该跨出包:${line}`)
})

test('目录里没有代码不认识的模板,也没有代码要而目录没有的', async () => {
  const onDisk = (await readdir(path.join(import.meta.dirname, 'prompts')))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort()
  assert.deepEqual(onDisk, [...USED].sort())
})

test('数据里出现 {{词}} 不该炸掉渲染', async () => {
  // 事故形状:残留检查跑在替换后的全文上,于是目标写「把模板里的 {{name}} 换成真实值」、
  // 或者验收输出里带 Vue/Jinja 语法,就会每 3 秒抛一次、10 分钟后把目标判成受阻。
  const text = await renderPrompt('continuation', {
    objective: '把模板里的 {{name}} 和 {{list}} 占位符替换成真实值',
    claimPath: '/tmp/c',
    turns: 1,
    maxTurns: '不限',
    elapsedMinutes: 1,
    maxMinutes: '不限',
    editsSource: '-',
    editsTest: '-',
    diffChanged: '-',
    tamperNote: '-'
  })
  assert.ok(text.includes('{{name}}'), '目标原文里的占位符要原样保留')
})

test('模板真缺变量时仍然要抛', async () => {
  await assert.rejects(() => renderPrompt('continuation', { objective: 'x' }), /需要变量/)
})
