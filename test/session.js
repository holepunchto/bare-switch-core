const test = require('brittle')

const Session = require('../lib/session')
const Switch = require('../lib/switch')

class FakeConnection {
  constructor() {
    this.written = []
    this._handlers = new Map()
  }

  on(name, fn) {
    this._handlers.set(name, fn)
    return this
  }

  emit(name, ...args) {
    const handler = this._handlers.get(name)
    if (handler !== undefined) handler(...args)
  }

  write(data) {
    this.written.push(data)
  }
}

class FakeSwarm {
  constructor() {
    this.joined = []
    this.keyPair = { publicKey: Buffer.alloc(32).fill(0xab) }
    this._onconnection = () => {}
  }

  on(name, fn) {
    if (name === 'connection') this._onconnection = fn
    return this
  }

  join(topic, opts) {
    this.joined.push({ topic, opts })
    return this
  }

  connect() {
    const connection = new FakeConnection()
    this._onconnection(connection)
    return connection
  }
}

test('joins the shared topic as both server and client', (t) => {
  const swarm = new FakeSwarm()

  new Session({ swarm })

  t.is(swarm.joined.length, 1, 'joined once')
  t.alike(swarm.joined[0].topic, Session.TOPIC, 'on the shared topic')
  t.alike(swarm.joined[0].opts, { server: true, client: true })
})

test('a new peer is counted and sent the current state', (t) => {
  const peers = []
  const swarm = new FakeSwarm()
  const session = new Session({ onPeers: (count) => peers.push(count), swarm })

  session.setLocal(true)
  const connection = swarm.connect()

  t.alike(peers, [1], 'the peer count is announced')
  t.is(session.peers, 1)
  t.alike(connection.written, [Switch.encode(true)], 'the newcomer is brought in sync')
})

test('a remote flip updates state and reaches the UI without re-broadcasting', (t) => {
  const states = []
  const swarm = new FakeSwarm()
  const session = new Session({ onState: (on) => states.push(on), swarm })

  const connection = swarm.connect()
  connection.written.length = 0
  connection.emit('data', Switch.encode(true))

  t.is(session.on, true, 'state is updated')
  t.alike(states, [true], 'the UI is told a peer changed it')
  t.alike(connection.written, [], 'not echoed back to the peer that sent it')
})

test('a local flip is broadcast to every peer', (t) => {
  const swarm = new FakeSwarm()
  const session = new Session({ swarm })

  const first = swarm.connect()
  const second = swarm.connect()
  first.written.length = 0
  second.written.length = 0

  t.is(session.setLocal(true), true, 'returns the authoritative state')
  t.alike(first.written, [Switch.encode(true)])
  t.alike(second.written, [Switch.encode(true)])
})

test('a closed connection is dropped from the peer count', (t) => {
  const peers = []
  const swarm = new FakeSwarm()
  const session = new Session({ onPeers: (count) => peers.push(count), swarm })

  const connection = swarm.connect()
  connection.emit('close')

  t.alike(peers, [1, 0], 'the count is announced on connect and on close')
  t.is(session.peers, 0)
})

test('publicKey is a short hex prefix of the swarm key', (t) => {
  const session = new Session({ swarm: new FakeSwarm() })

  t.is(session.publicKey, 'abababab')
})
