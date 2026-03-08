// Test Electron 34 with CJS require from .mjs
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

console.log('electron v:', process.versions.electron, 'node:', process.versions.node)

// Patch Module._load to see what happens
import Module from 'module'
const origLoad = Module._load
Module._load = function(req, ...rest) {
  if (req === 'electron') {
    const result = origLoad.call(Module, req, ...rest)
    console.log('require electron result type:', typeof result)
    return result
  }
  return origLoad.call(Module, req, ...rest)
}

const e = require('electron')
console.log('final:', typeof e, typeof e === 'object' ? Object.keys(e).slice(0,5) : String(e).slice(0,50))
