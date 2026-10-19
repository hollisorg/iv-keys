// Client for IV Voice's local control pipe (see iv-voice/src/main/control.js).
// Keeps a "subscribe" connection open so recording state updates instantly, reconnecting every
// 2 s while IV Voice isn't running. Commands go over their own short-lived connections.
import { EventEmitter } from 'node:events'
import net from 'node:net'
import os from 'node:os'

export const PIPE = `\\\\.\\pipe\\iv-voice-${os.userInfo().username.replace(/[^\w.-]/g, '_')}`

export class VoiceClient extends EventEmitter {
  constructor() {
    super()
    this.state = { connected: false, state: 'idle', locked: false }
    this.socket = null
    this.timer = null
    this.closed = false
    this.connect()
  }

  set(next) {
    const merged = { ...this.state, ...next }
    if (JSON.stringify(merged) === JSON.stringify(this.state)) return
    this.state = merged
    this.emit('change', this.state)
  }

  connect() {
    if (this.closed) return
    const socket = net.connect(PIPE)
    this.socket = socket
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write('{"cmd":"subscribe"}\n'))
    socket.on('data', (chunk) => {
      buffer += chunk
      let i
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i)
        buffer = buffer.slice(i + 1)
        try {
          const msg = JSON.parse(line)
          if (msg.ok) this.set({ connected: true, state: msg.state, locked: Boolean(msg.locked) })
        } catch {
          /* ignore malformed line */
        }
      }
    })
    const retry = () => {
      socket.removeAllListeners()
      socket.destroy()
      this.set({ connected: false, state: 'idle', locked: false })
      clearTimeout(this.timer)
      if (!this.closed) this.timer = setTimeout(() => this.connect(), 2000)
    }
    socket.on('error', retry)
    socket.on('close', retry)
  }

  send(cmd) {
    return new Promise((resolve, reject) => {
      const socket = net.connect(PIPE)
      let buffer = ''
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error('IV Voice did not answer'))
      }, 3000)
      socket.setEncoding('utf8')
      socket.on('connect', () => socket.write(JSON.stringify({ cmd }) + '\n'))
      socket.on('data', (chunk) => {
        buffer += chunk
        const i = buffer.indexOf('\n')
        if (i < 0) return
        clearTimeout(timer)
        socket.end()
        try {
          const msg = JSON.parse(buffer.slice(0, i))
          msg.ok ? resolve(msg) : reject(new Error(msg.error || 'IV Voice refused the command'))
        } catch {
          reject(new Error('IV Voice sent an unreadable reply'))
        }
      })
      socket.on('error', () => {
        clearTimeout(timer)
        reject(new Error('IV Voice isn’t running'))
      })
    })
  }

  close() {
    this.closed = true
    clearTimeout(this.timer)
    this.socket?.destroy()
  }
}
