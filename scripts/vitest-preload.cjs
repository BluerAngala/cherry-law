const childProcess = require('node:child_process')
const { EventEmitter } = require('node:events')

const originalExec = childProcess.exec

childProcess.exec = function patchedExec(command, options, callback) {
  if (typeof command === 'string' && command.trim().toLowerCase() === 'net use') {
    const cb = typeof options === 'function' ? options : callback

    if (typeof cb === 'function') {
      queueMicrotask(() => {
        cb(null, '', '')
      })
    }

    return new EventEmitter()
  }

  return originalExec.call(this, command, options, callback)
}
