// The peer-to-peer half of the switch, with nothing said about how it is hosted:
// it owns the Hyperswarm node and the shared state and reports every change
// through injected callbacks. A worklet behind an IPC boundary and an in-process
// UI consume it the same way, which is what lets the example shells differ only
// in their presentation layer.
const Hyperswarm = require('hyperswarm')

const Switch = require('./switch')

// Every copy of the app joins the same 32-byte topic, so they all meet on the
// DHT. (A real app would let the user pick a room; we keep one fixed room so
// "launch it twice and watch them sync" just works.) Every shell shares this
// name, so changing it breaks interoperability between them.
const ROOM = 'bare-macos-switch'
const TOPIC = Buffer.alloc(32).fill(ROOM)

module.exports = exports = class Session {
  // `swarm` exists so the wiring below can be tested without a network; leave it
  // out and a real Hyperswarm node is created.
  constructor({ onState = () => {}, onPeers = () => {}, swarm = new Hyperswarm() } = {}) {
    this._swarm = swarm
    this._peers = new Set()
    this._onPeers = onPeers

    // INTENTIONALLY NAIVE: this is a last-writer-wins value with no conflict
    // resolution, so peers can diverge (e.g. flip before another peer joins).
    // That divergence is a teaching point demonstrated in the README, not a bug
    // to fix here - convergent multi-writer state belongs in Autobase
    // (https://github.com/holepunchto/autobase). Please don't "fix" it with a
    // clock or merge strategy; it would defeat the example.
    this._switch = new Switch({
      broadcast: (on) => {
        for (const connection of this._peers) connection.write(Switch.encode(on))
      },
      notify: onState
    })

    // The peer protocol is deliberately a single byte: each write is one
    // `Switch.encode(...)` (one byte) and `Switch.decode` takes the last byte of
    // a chunk (latest wins if writes coalesce). Adding a second message type
    // here would break that invariant and need real framing (e.g. bare-rpc).
    this._swarm.on('connection', (connection) => {
      this._peers.add(connection)
      this._announce()

      // Bring the newcomer in sync with our current state immediately.
      connection.write(Switch.encode(this._switch.on))

      connection.on('data', (data) => this._switch.applyRemote(Switch.decode(data)))
      connection.on('error', () => {}) // ignore peer resets
      connection.on('close', () => {
        this._peers.delete(connection)
        this._announce()
      })
    })

    this._swarm.join(TOPIC, { server: true, client: true })
  }

  get on() {
    return this._switch.on
  }

  get peers() {
    return this._peers.size
  }

  // Enough of our key to tell two windows apart on screen.
  get publicKey() {
    return Buffer.from(this._swarm.keyPair.publicKey).toString('hex').slice(0, 8)
  }

  // The user flipped the switch: apply it locally, push it to peers, and return
  // the authoritative state.
  setLocal(on) {
    return this._switch.setLocal(on)
  }

  _announce() {
    this._onPeers(this._peers.size)
  }
}

exports.ROOM = ROOM
exports.TOPIC = TOPIC
