// 提示词模板是运行时按名字读盘的 —— 缺一个,目标就在「要发下一轮」的那一刻死掉。
// 真发生过:一次目录搬迁把 prompts/ 挪到了别处,跑了两个多小时的目标 ENOENT 退出。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { renderPrompt } from './continuation-prompt.mjs'

// 驱动能请求的全部模板,和 goal-driver-entry.mjs 的 setTemplateSource 一一对应。
const USED = ['guard', 'first-turn', 'continuation', 'objective-updated', 'budget-limit']
const WORKER_MESSAGES = ['first-turn', 'continuation', 'objective-updated', 'budget-limit']

async function varsOf(name) {
  // 变量表从模板自身抽,免得测试和模板各写各的、漏了也发现不了
  const raw = await readFile(path.join(import.meta.dirname, 'prompts', `${name}.md`), 'utf8')
  const vars = {}
  for (const m of raw.matchAll(/\{\{(\w+)\}\}/g)) {
    vars[m[1]] = 'X'
  }
  return { raw, vars }
}

test('每个模板都真的能从磁盘读出来并渲染完整', async () => {
  for (const name of USED) {
    const { vars } = await varsOf(name)
    const text = await renderPrompt(name, vars)
    assert.ok(text.length > 0, `${name} 渲染结果为空`)
    assert.ok(!text.includes('{{'), `${name} 渲染后还留着未替换的占位符`)
  }
})

test('入口内联的模板和目录里的一一对应', async () => {
  const onDisk = (await readdir(path.join(import.meta.dirname, 'prompts')))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort()
  assert.deepEqual(onDisk, [...USED].sort())
  const entry = await readFile(new URL('./goal-driver-entry.mjs', import.meta.url), 'utf8')
  for (const name of USED) {
    assert.ok(entry.includes(`./prompts/${name}.md`), `入口没有内联 ${name}.md`)
  }
})

test('发给执行 agent 的消息都带来源标记,且不带轮数和时长(C14)', async () => {
  for (const name of WORKER_MESSAGES) {
    const { vars } = await varsOf(name)
    const text = await renderPrompt(name, vars)
    assert.ok(text.startsWith('【Goal 自动消息】'), `${name} 缺少来源标记`)
    assert.ok(!('turn' in vars || 'maxTurns' in vars || 'elapsed' in vars), `${name} 不该带预算`)
  }
})

test('首轮和改目标时带目标原文,续跑只带原文文件路径;续跑同时给出守卫看到的和指示', async () => {
  // 长消息经终端注入会被截断(octo 那次 5.4 KB 投递 7 次残缺 6 次),续跑消息只带路径。
  for (const name of ['first-turn', 'objective-updated']) {
    const { vars } = await varsOf(name)
    assert.ok('objective' in vars && 'checklistPath' in vars, `${name} 缺目标原文或清单位置`)
  }
  const { vars: continuation } = await varsOf('continuation')
  assert.ok(!('objective' in continuation), 'continuation 不该每轮重发目标原文')
  assert.ok('objectivePath' in continuation && 'checklistPath' in continuation)
  for (const name of ['continuation', 'objective-updated']) {
    const { vars } = await varsOf(name)
    assert.ok('observation' in vars && 'instruction' in vars, `${name} 缺守卫的观察或指示`)
  }
})

test('守卫提示词要的材料都由驱动给出,且不带预算数字', async () => {
  const src = await readFile(new URL('./guard-materials.mjs', import.meta.url), 'utf8')
  const body = src.match(/export async function guardMaterials[\s\S]*?\n\}/)[0]
  const { vars } = await varsOf('guard')
  for (const name of Object.keys(vars)) {
    assert.match(body, new RegExp(`\\b${name}:`), `guardMaterials 没有提供 ${name}`)
  }
  // 预算由驱动执行;写进守卫提示词没有用处,还可能诱导它临近上限时放宽标准。
  for (const name of ['turn', 'maxTurns', 'elapsed', 'maxMinutes']) {
    assert.ok(!(name in vars), `守卫提示词不该带 ${name}`)
  }
})

test('数据里出现 {{词}} 不该炸掉渲染', async () => {
  const text = await renderPrompt('first-turn', {
    objective: '把模板里的 {{name}} 和 {{list}} 占位符替换成真实值',
    checklistPath: '/tmp/c'
  })
  assert.ok(text.includes('{{name}}'), '目标原文里的占位符要原样保留')
})

test('模板真缺变量时仍然要抛', async () => {
  await assert.rejects(() => renderPrompt('continuation', { observation: 'x' }), /需要变量/)
})

test('模板目录和代码同处一个包 —— 别再用 .. 跨出去', async () => {
  const src = await readFile(new URL('./continuation-prompt.mjs', import.meta.url), 'utf8')
  const line = src.match(/PROMPTS_DIR = .*/)[0]
  assert.ok(!line.includes("'..'"), `模板路径不该跨出包:${line}`)
})
