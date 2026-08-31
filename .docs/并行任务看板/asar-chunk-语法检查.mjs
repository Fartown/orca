import asar from '@electron/asar'
import { parse } from 'acorn'

const app = process.argv[2]
const files = asar.listPackage(app).filter((f) => f.endsWith('.js') && f.includes('renderer'))
let bad = 0
for (const f of files) {
  const rel = f.replace(/^[/\\]/, '')
  let src
  try {
    src = asar.extractFile(app, rel).toString('utf8')
  } catch {
    continue
  }
  try {
    parse(src, { ecmaVersion: 'latest', sourceType: 'module' })
  } catch (e) {
    bad++
    console.log(`BROKEN ${rel}\n   ${e.message}`)
  }
}
console.log(`checked ${files.length} renderer chunks, broken=${bad}`)
