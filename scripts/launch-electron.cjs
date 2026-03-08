/**
 * Cross-platform Electron launcher.
 * Unsets ELECTRON_RUN_AS_NODE (set by VSCode) so Electron starts as a real app.
 */
const { spawnSync } = require('child_process')
const electronPath = require('electron') // returns binary path string when run by Node.js

const env = Object.assign({}, process.env)
delete env.ELECTRON_RUN_AS_NODE

const result = spawnSync(electronPath, ['.'], { stdio: 'inherit', env })
process.exit(result.status ?? 0)
