import { chromium } from 'playwright'

const b = await chromium.connectOverCDP('http://127.0.0.1:9367')
const page = b.contexts()[0].pages()[0]

// 先验环境本身。CDP 的 setViewportSize 会把渲染视口撑得比 OS 窗口宽,多出来的部分
// 被窗口边框裁掉 —— 从页面里量什么都「没溢出」,真窗口里却是缺一块的。
// 这一条必须排在所有面板测量之前,否则后面量到的全是假的。
const env = await page.evaluate(() => ({
  innerWidth: window.innerWidth,
  outerWidth: window.outerWidth,
  innerHeight: window.innerHeight,
  outerHeight: window.outerHeight
}))
if (env.innerWidth > env.outerWidth || env.innerHeight > env.outerHeight) {
  console.error(
    `✗ 渲染视口比窗口大(${env.innerWidth}x${env.innerHeight} vs ${env.outerWidth}x${env.outerHeight})。` +
      '窗口边框会裁掉超出的部分,页内测量不可信。别用 page.setViewportSize()。'
  )
  await b.close()
  process.exitCode = 1 // exit(1) 会被 Playwright 的清理吞掉,用 exitCode 才留得住
  throw new Error('环境不可信,后续测量没有意义')
}
console.log(
  `视口 ${env.innerWidth}x${env.innerHeight} ≤ 窗口 ${env.outerWidth}x${env.outerHeight} ✓`
)

async function openPanel() {
  await page.evaluate(() => window.api.plugins.refresh())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button,[role=button]')].find(
      (e) => (e.getAttribute('title') || e.getAttribute('aria-label') || '') === '目标'
    )
    el?.click()
  })
  await page.waitForTimeout(6000)
}

// 面板是 opaque origin(sandbox 不带 allow-same-origin),父页面读不到 contentDocument。
// 必须走 frame 执行上下文 —— CDP 能进去,同源策略管不着。
function panelFrame() {
  return page.frames().find((f) => f !== page.mainFrame())
}

async function measure(label) {
  const frame = panelFrame()
  if (!frame) {
    return { err: '没有子 frame,面板大概没打开' }
  }
  const m = await frame.evaluate(() => {
    const d = document
    if (!d.getElementById('status-sec')) {
      return { err: '这个 frame 不是目标面板' }
    }
    const cs = getComputedStyle(d.body)
    const statusSec = d.getElementById('status-sec')
    const host = d.documentElement
    return {
      htmlClass: host.className,
      面板底色: cs.backgroundColor,
      文字色: cs.color,
      宿主注入的border: getComputedStyle(host).getPropertyValue('--border').trim(),
      视口宽: host.clientWidth,
      内容宽: host.scrollWidth,
      横向溢出: host.scrollWidth > host.clientWidth + 1,
      纵向可滚: host.scrollHeight > host.clientHeight,
      状态区可见: statusSec ? !statusSec.hidden : null,
      状态文字: d.getElementById('status-text')?.textContent || '',
      统计: d.getElementById('status-facts')?.textContent || '',
      阻塞提示: d.getElementById('blocker-sec')?.hidden === false
    }
  })
  console.log(`\n【${label}】`)
  for (const [k, v] of Object.entries(m)) {
    console.log(`  ${k}: ${v}`)
  }
  return m
}

await openPanel()
const light = await measure('浅色')
await page.screenshot({ path: '.docs/goal-mode-plugin/mockup/panel-light.png' })

// 改真设置,不是往 <html> 上贴 class —— 贴的 class 会被随后的 reload 冲掉。
await page.evaluate(() => window.api.settings.set({ theme: 'dark' }))
await page.waitForTimeout(1500)
await openPanel()
const dark = await measure('暗色')
await page.screenshot({ path: '.docs/goal-mode-plugin/mockup/panel-dark.png' })

const fail = []
for (const [name, m] of [
  ['浅色', light],
  ['暗色', dark]
]) {
  if (m.err) {
    fail.push(`${name}: ${m.err}`)
  } else {
    if (m.横向溢出) {
      fail.push(`${name}: 横向溢出(内容 ${m.内容宽} > 面板 ${m.面板宽})`)
    }
    if (m.阻塞提示) {
      fail.push(`${name}: 出现阻塞提示,storage.get 被拒`)
    }
    if (!m.状态区可见) {
      fail.push(`${name}: 状态区没显示`)
    }
  }
}
if (light.面板底色 === dark.面板底色) {
  fail.push('深浅两套底色相同 —— 主题没跟随宿主')
}
console.log(`\n${fail.length ? `✗ ${fail.join(' / ')}` : '✓ 全部通过'}`)
if (fail.length) {
  process.exitCode = 1
}
await page.evaluate(() => window.api.settings.set({ theme: 'light' })) // 还原
await b.close()
