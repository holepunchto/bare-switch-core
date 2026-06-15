# bare-switch-core

The shared peer-to-peer **switch core** behind the [bare-macos](https://github.com/holepunchto/bare-macos) / [bare-ios](https://github.com/holepunchto/bare-ios) example shells. It is the "core" in the Tether-stack sense: the worklet (`backend.js` + `lib/switch.js`), the protocol (`schema.js`), and the committed generated bindings under `spec/` (JS for the worklet, Swift for the shells).

Shells consume this package; they run no codegen. Edit `schema.js`, run `npm run schema`, commit the regenerated `spec/`.

> The switch is deliberately last-writer-wins with no conflict resolution. The divergence that causes is a teaching point (it motivates Autobase), not a bug.

## Develop

```sh
npm install
npm run schema   # regenerate spec/ (JS + Swift)
npm test         # switch logic on Bare
npm run lint
```
