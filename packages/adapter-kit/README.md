# @mithril-inspector/adapter-kit

Shared, bundler-neutral pieces factored out of `@mithril-inspector/vite`
so `rollup`, `esbuild` and `webpack` reuse them instead of copying them
(ADR-004). Not a standalone integration by itself — every build-tool adapter
still owns its own bundler-specific hook wiring (Vite's
`configResolved`/`transformIndexHtml`/`configureServer`, Rollup's
`this.meta.watchMode`, ...).

No bundler import of any kind (ADR-004): this package only depends on the
other bundler-neutral core packages (`overlay`, `protocol`, `runtime`,
`server`, `transform`).

## What's here

- **`resolveInspectorOptions`** (`options.ts`) — the full `MithrilInspectorOptions`
  surface plus `mode` and `redact`, resolved into a
  fully-defaulted `ResolvedInspectorOptions`, and four derived builders
  (`toRuntimeBootstrapConfig`, `toOverlayOptionsInput`, `toServerOptions`,
  `toTransformOptions`) that turn it into each dependency's own option shape.
- **`ids.ts`** — the two virtual module specifiers
  (`virtual:mithril-inspector/runtime` / `.../overlay`) and their `\0`-prefixed
  resolved ids.
- **`virtual-modules.ts`** — `resolveVirtualId`/`loadVirtualModule` plus the
  generated source of both virtual modules (`runtimeModuleCode`,
  `overlayModuleCode`): re-exporting the transform-facing runtime helpers,
  installing a configured runtime on the global hook, and mounting the
  shadow-root overlay.
- **`module-filter.ts`** — `shouldAttemptTransform`, the coarse pre-filter
  every adapter's `transform`/`load` hook runs before calling into the shared
  transform: skip `\0`-prefixed virtual modules, `node_modules`, and the
  inspector's own packages (which import Mithril themselves and must never be
  instrumented recursively).
- **`hmr-protocol.ts`** — `HMR_INVALIDATE_EVENT`/`HmrInvalidatePayload`
  (ADR-106): the wire-protocol constant the generated runtime bootstrap
  listens for. A dev-server adapter with real HMR (Vite, webpack) dispatches
  it; one without (Rollup and esbuild have no fine-grained HMR, only
  watch-mode rebuilds) simply never sends it — the constant is still shared
  so the generated bootstrap code is identical either way.

## What's *not* here

Anything that needs a specific bundler's own API: Vite's HTML injection
(`transformIndexHtml`/`HtmlTagDescriptor`), its dev server middleware
registration (`configureServer`), and its real HMR event dispatch
(`handleHotUpdate`) stay in `@mithril-inspector/vite` itself, since Rollup and
esbuild have no equivalent hooks.
