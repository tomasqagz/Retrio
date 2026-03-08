import { createRequire } from 'module'
const require = createRequire(import.meta.url)

console.log('process.type:', process.type)
try {
  const e = require('electron')
  console.log('require(electron):', typeof e, typeof e === 'string' ? '→ BROKEN string' : '→ OK object, keys: ' + Object.keys(e).slice(0,5).join(', '))
} catch(err) {
  console.log('require(electron) error:', err.message)
}

try {
  const em = await import('electron/main')
  console.log('import(electron/main):', typeof em, Object.keys(em).slice(0,5).join(', '))
} catch(err) {
  console.log('import(electron/main) error:', err.message)
}
