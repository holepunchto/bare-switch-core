// One schema, many runtimes.
//
// This single file defines the wire protocol once and emits it for every side
// of the app, all under spec/ (the conventional home for generated code):
//
//   - the Bare worklet (JavaScript): spec/schema, spec/hrpc (index.js, *.json)
//   - the native macOS UI (Swift):   the same dirs (Package.swift + Sources)
//   - native hosts (C, e.g. bare-linux): the same dirs (sync_*.{h,c} + CMakeLists.txt)
//
// Each UI and the Bare backend speak a typed, generated protocol with no
// hand-written byte parsing on either side. Edit the definitions below and
// re-run `npm run schema` (the Xcode build re-runs it too).

const path = require('path')

const Hyperschema = require('hyperschema')
const HRPCBuilder = require('hrpc')
const SwiftHyperschema = require('hyperschema-swift')
const SwiftHRPC = require('hrpc-swift')
const CHyperschema = require('hyperschema-c')
const CHRPC = require('hrpc-c')

const ROOT = __dirname

const SCHEMA_DIR = path.join(ROOT, 'spec', 'schema')
const HRPC_DIR = path.join(ROOT, 'spec', 'hrpc')

const NS = 'sync'

// --- The protocol, defined once ---

// Message types (become compact-encoding codecs in JS and structs in Swift).
function defineTypes(ns) {
  // Do not name this 'state': the Swift codegen would emit a `State` struct that
  // collides with `CompactEncoding.State` inside the generated codecs.
  // 'switch-state' -> `SwitchState`, which is collision-free.
  ns.register({
    name: 'switch-state',
    fields: [{ name: 'on', type: 'bool', required: true }]
  })
  // Named 'identity' rather than 'info' so its codec property does not collide
  // with the 'info' command method in the generated Swift class.
  ns.register({
    name: 'identity',
    fields: [
      { name: 'publicKey', type: 'string', required: true },
      { name: 'topic', type: 'string', required: true }
    ]
  })
  ns.register({
    name: 'peers',
    fields: [{ name: 'count', type: 'uint', required: true }]
  })
}

// RPC commands (become typed methods + handlers on both sides).
function defineCommands(ns) {
  // UI -> worklet: request the switch be set; worklet replies with the
  // authoritative state after broadcasting it to peers.
  ns.register({
    name: 'set-state',
    request: { name: '@sync/switch-state', stream: false },
    response: { name: '@sync/switch-state', stream: false }
  })

  // worklet -> UI: the switch changed because a peer flipped it.
  ns.register({
    name: 'new-state',
    request: { name: '@sync/switch-state', stream: false, send: true },
    response: null
  })

  // worklet -> UI: the number of connected peers changed.
  ns.register({
    name: 'peers-changed',
    request: { name: '@sync/peers', stream: false, send: true },
    response: null
  })

  // worklet -> UI: our identity and topic, emitted once on startup.
  ns.register({
    name: 'info',
    request: { name: '@sync/identity', stream: false, send: true },
    response: null
  })
}

// --- Emit the JavaScript side (for the Bare worklet) ---

const jsSchema = Hyperschema.from(SCHEMA_DIR)
defineTypes(jsSchema.namespace(NS))
Hyperschema.toDisk(jsSchema)

const jsHrpc = HRPCBuilder.from(SCHEMA_DIR, HRPC_DIR)
defineCommands(jsHrpc.namespace(NS))
HRPCBuilder.toDisk(jsHrpc)

// --- Emit the Swift side (for the native UI), into the same spec/ dirs ---

const swiftSchema = SwiftHyperschema.from(null)
defineTypes(swiftSchema.namespace(NS))

const swiftHrpc = SwiftHRPC.from(swiftSchema)
defineCommands(swiftHrpc.namespace(NS))

SwiftHyperschema.toDisk(swiftSchema, SCHEMA_DIR)
SwiftHRPC.toDisk(swiftHrpc, HRPC_DIR, {
  schemaPackagePath: '../schema',
  schemaPackageName: 'Schema',
  schemaPackageId: 'schema'
})

// --- Emit the C side (for native hosts, e.g. bare-linux), into the same spec/ dirs ---

const cSchema = CHyperschema.from(null)
defineTypes(cSchema.namespace(NS))

const cHrpc = new CHRPC(cSchema, null, {
  hrpcDir: HRPC_DIR,
  schemaDir: SCHEMA_DIR
})
defineCommands(cHrpc.namespace(NS))

CHyperschema.toDisk(cSchema, SCHEMA_DIR)
CHRPC.toDisk(cHrpc, HRPC_DIR)

console.log('Wrote generated code to', path.relative(ROOT, path.dirname(SCHEMA_DIR)))
