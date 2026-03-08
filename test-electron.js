'use strict'
// Check ALL electron-specific process properties
console.log('process.type:', process.type)
console.log('process.contextId:', process.contextId)
console.log('process.guestInstanceId:', process.guestInstanceId)
console.log('process.isMainFrame:', process.isMainFrame)
console.log('process.role:', process.role)
// Check if this is running as node (not electron) main process
console.log('process.execPath:', process.execPath.slice(-20))
console.log('electron version from versions:', process.versions.electron)
// Try accessing electron API via process
console.log('process.electronBinding:', typeof process.electronBinding)
console.log('process._linkedBinding:', typeof process._linkedBinding)
// Check what global.electron is 
const g = Object.keys(global).filter(k => !['process', 'require', 'module', 'exports', '__filename', '__dirname', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'queueMicrotask', 'Buffer', 'console', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'performance'].includes(k))
console.log('extra global keys:', g.slice(0, 10))
