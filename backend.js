// The Bare worklet: the "backend" of the app, running on its own thread inside
// the host app's process (macOS, iOS, ...). It exposes a typed hrpc interface to
// the native UI over the IPC channel, and nothing else - the peer-to-peer work
// lives in ./lib/session.js, which knows nothing about IPC and is shared with
// the in-process shells that have no worklet at all.
//
// There is no server anywhere. Two instances of the app find each other through
// the distributed hash table and talk directly, end-to-end encrypted.

const HRPC = require('./spec/hrpc')
const Session = require('./lib/session')

// `Bare.IPC` is the duplex byte stream to the Swift side injected by the host.
// hrpc rides on top of it and handles all framing/encoding.
const { IPC } = Bare
const rpc = new HRPC(IPC)

// --- session -> UI ---
const session = new Session({
  onState: (on) => rpc.newState({ on }),
  onPeers: (count) => {
    console.log('[worklet] peers -', count)
    rpc.peersChanged({ count })
  }
})

// --- UI -> session ---
// The user flipped the switch; apply it locally, push to peers, and reply with
// the authoritative state.
rpc.onSetState(({ on }) => ({ on: session.setLocal(on) }))

// Tell the UI who we are. Sent once; the IPC stream buffers it until the UI's
// read loop attaches.
console.log('[worklet] up - key', session.publicKey, 'topic', Session.ROOM)
rpc.info({ publicKey: session.publicKey, topic: Session.ROOM })
