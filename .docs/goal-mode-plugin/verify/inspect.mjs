import { chromium } from 'playwright'
const b = await chromium.connectOverCDP('http://127.0.0.1:9367')
const page = b.contexts()[0].pages()[0]
const out = await page.evaluate(() => {
  const api = window.api || {}
  const pick = (o) => (o && typeof o === 'object' ? Object.keys(o) : typeof o)
  return {
    hasApi: !!window.api,
    apiKeys: Object.keys(api),
    plugins: pick(api.plugins),
    settings: pick(api.settings)
  }
})
console.log(JSON.stringify(out, null, 1))
await b.close()
