# Mithril Inspector — Implementation Specification

## 1. Product summary

Build an open-source development tool for Mithril.js applications named **Mithril Inspector**.

Mithril Inspector shall provide:

1. An unobtrusive in-page tab fixed near the bottom of the browser window.
2. A visual element inspector:

   * activate inspection mode;
   * hover over rendered elements;
   * highlight the element;
   * show its Mithril component and source location;
   * click to select it;
   * open the relevant source file and line in VS Code or another configured editor.
3. A component-tree inspector:

   * display the Mithril component hierarchy;
   * associate components with rendered DOM nodes;
   * inspect component attrs, state and source location;
   * navigate between a component and its rendered element.
4. A bundler-neutral core, with Vite as the first and best-supported integration.
5. Development-only instrumentation that is completely removed from production builds.

The initial implementation shall target Mithril 2.x applications written in modern JavaScript or TypeScript, using hyperscript, JSX or TSX where technically feasible.

---

# 2. Product principles

## 2.1 Development-only

The inspector must not be included in production bundles unless explicitly forced.

Default behavior:

```ts
mithrilInspector({
  enabled: process.env.NODE_ENV !== "production",
})
```

For Vite, the plugin shall automatically disable itself when `config.command === "build"` unless `includeInProduction` is explicitly enabled.

## 2.2 No required application-code changes

A normal Vite application should only require:

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { mithrilInspector } from "@mithril-inspector/vite"

export default defineConfig({
  plugins: [mithrilInspector()],
})
```

The application should not need to:

* wrap every component manually;
* replace its normal `m` import;
* add source attributes;
* install a browser extension;
* change `m.mount`, `m.route` or `m.render` calls.

An optional explicit runtime API may be offered for uncommon patterns.

## 2.3 Preserve application semantics

Instrumentation must not:

* modify component return values in a way visible to application code;
* introduce wrapper DOM elements;
* change keyed-list behavior;
* alter lifecycle ordering;
* mutate application attrs;
* replace component state objects;
* interfere with redraw scheduling;
* add visible `data-*` attributes by default;
* prevent tree-shaking in production builds.

## 2.4 Graceful degradation

When exact source mapping is unavailable, the inspector should still show the best information it has:

1. exact element expression location;
2. component view location;
3. component declaration location;
4. module filename;
5. anonymous or unknown component.

The user interface must distinguish exact mappings from inferred mappings.

---

# 3. Scope

## 3.1 MVP scope

The first usable release shall support:

* Vite;
* Mithril 2.x;
* TypeScript and JavaScript;
* standard `m(...)` hyperscript calls;
* object components;
* closure components;
* class components;
* function components where supported by Mithril;
* element hover and highlight;
* source tooltip;
* click to open source;
* bottom tab;
* selected-element details;
* a basic component ancestry list;
* VS Code, VS Code Insiders and configurable editors;
* multiple application roots;
* iframes only when they are same-origin and explicitly enabled;
* Vitest unit tests;
* browser integration tests.

## 3.2 Subsequent scope

After the MVP:

* full expandable component tree;
* attrs and state inspection;
* DOM-to-component and component-to-DOM navigation;
* component update counters;
* redraw visualization;
* component render timing;
* component search;
* pinned components;
* Webpack adapter;
* Rollup adapter;
* esbuild adapter;
* Rspack adapter;
* browser extension integration;
* Firefox support;
* JSX/TSX source mapping beyond common configurations;
* optional custom DevTools panel.

## 3.3 Explicit non-goals for the MVP

Do not initially implement:

* editing attrs or state;
* time-travel debugging;
* production debugging;
* remote debugging of deployed websites;
* a Chrome extension as the primary interface;
* a replacement DOM inspector;
* a full Mithril profiler;
* support for Mithril 0.x or 1.x;
* arbitrary minified production bundles.

---

# 4. Repository structure

Use a package-based monorepo.

```text
mithril-inspector/
├─ apps/
│  ├─ playground-vite/
│  ├─ playground-esbuild/
│  └─ test-fixtures/
├─ packages/
│  ├─ protocol/
│  ├─ transform/
│  ├─ runtime/
│  ├─ overlay/
│  ├─ server/
│  ├─ vite/
│  ├─ rollup/
│  ├─ esbuild/
│  └─ webpack/
├─ tests/
│  ├─ fixtures/
│  ├─ integration/
│  └─ browser/
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.json
└─ vitest.workspace.ts
```

Package responsibilities:

### `@mithril-inspector/protocol`

Shared serializable types and constants.

No browser, Node or bundler dependencies.

### `@mithril-inspector/transform`

AST analysis and source instrumentation.

The package must expose a bundler-neutral transform function:

```ts
export interface TransformOptions {
  id: string
  code: string
  root?: string
  sourcemap?: boolean
  include?: FilterPattern
  exclude?: FilterPattern
}

export interface TransformResult {
  code: string
  map?: SourceMap
  metadata: ModuleInspectionMetadata
}

export function transformMithrilModule(
  options: TransformOptions,
): TransformResult | null
```

### `@mithril-inspector/runtime`

Runtime registration, component tracking, vnode ownership tracking and DOM association.

It must not contain the visual interface.

### `@mithril-inspector/overlay`

The in-page UI, element picker, highlighter and component tree.

The overlay should itself be written in Mithril.js.

### `@mithril-inspector/server`

Editor launching, path validation and shared development-server middleware.

### `@mithril-inspector/vite`

Vite adapter combining transform, runtime injection, HTML injection and server middleware.

### Other bundler packages

Thin adapters around the transform, runtime and server packages.

Do not duplicate transformation or editor-launch logic in individual adapters.

---

# 5. High-level architecture

The system consists of four layers:

```text
Source module
    │
    ▼
Build-time AST transform
    │ emits source IDs and registration calls
    ▼
Mithril runtime instrumentation
    │ tracks components, vnodes and DOM ranges
    ▼
Inspector overlay
    │ selects DOM/component and requests navigation
    ▼
Development-server endpoint
    │ validates location and launches editor
    ▼
VS Code
```

The Vite adapter is responsible only for integrating these layers.

---

# 6. Source instrumentation

## 6.1 General strategy

Do not add filesystem information to DOM attributes by default.

The AST transform shall inject compact numeric or string source IDs into development code. Full source records shall be registered separately with the runtime.

Example input:

```ts
import m from "mithril"

export const UserCard = {
  view: ({ attrs }) =>
    m("article.user-card", [
      m("h2", attrs.name),
      m("button", { onclick: attrs.onEdit }, "Edit"),
    ]),
}
```

Conceptual output:

```ts
import m from "mithril"
import {
  registerModule as __miRegisterModule,
  source as __miSource,
  component as __miComponent,
} from "/@mithril-inspector/runtime"

__miRegisterModule("m17", {
  file: "/absolute/project/src/UserCard.ts",
  relativeFile: "src/UserCard.ts",
  sources: {
    s1: { line: 4, column: 3, kind: "component-view" },
    s2: { line: 5, column: 5, kind: "element", tag: "article" },
    s3: { line: 6, column: 7, kind: "element", tag: "h2" },
    s4: { line: 7, column: 7, kind: "element", tag: "button" },
  },
})

export const UserCard = __miComponent("m17:s1", {
  view: ({ attrs }) =>
    __miSource("m17:s2", m("article.user-card", [
      __miSource("m17:s3", m("h2", attrs.name)),
      __miSource(
        "m17:s4",
        m("button", { onclick: attrs.onEdit }, "Edit"),
      ),
    ])),
})
```

This output is illustrative. Codex may select a more efficient transform if it preserves the required semantics.

## 6.2 Preferred metadata attachment

When a source marker is associated with a vnode, store it using a private symbol or runtime `WeakMap`.

Do not add a normal enumerable attr such as:

```ts
vnode.attrs.__source = ...
```

Application code may enumerate or serialize attrs.

Preferred mechanisms:

```ts
const sourceByVNode = new WeakMap<object, SourceId>()
```

or a non-enumerable symbol property when the vnode’s lifecycle permits it:

```ts
Object.defineProperty(vnode, INSPECTOR_SOURCE, {
  value: sourceId,
  enumerable: false,
  configurable: true,
})
```

Use a `WeakMap` when vnode extensibility or framework assumptions make direct attachment unsafe.

## 6.3 Source location precision

Capture:

```ts
export interface SourceLocation {
  moduleId: string
  sourceId: string
  absoluteFile: string
  relativeFile: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
  kind:
    | "component-declaration"
    | "component-view"
    | "element"
    | "attribute"
    | "text-expression"
    | "unknown"
  displayName?: string
  tagName?: string
}
```

Lines and columns shall be one-based in public APIs.

## 6.4 Import detection

Recognize common Mithril imports:

```ts
import m from "mithril"
import Mithril from "mithril"
import { default as m } from "mithril"
const m = require("mithril")
```

The local binding may have any name.

Only transform calls associated with a confirmed Mithril binding.

Do not transform unrelated functions named `m`.

Provide configuration for wrappers or aliases:

```ts
mithrilInspector({
  mithrilImports: [
    "mithril",
    "@app/mithril",
  ],
  hyperscriptIdentifiers: ["m", "h"],
})
```

## 6.5 Component detection

Support these forms:

### Object component

```ts
const Component = {
  view(vnode) {
    return m("div")
  },
}
```

### Closure component

```ts
const Component = () => {
  let count = 0

  return {
    view() {
      return m("div", count)
    },
  }
}
```

### Class component

```ts
class Component {
  view() {
    return m("div")
  }
}
```

### Inline component

```ts
m({
  view: () => m("div"),
})
```

### Imported component usage

```ts
m(UserCard, attrs)
```

At minimum, instrument the usage location even when the declaration is in an untransformed dependency.

## 6.6 JSX and TSX

Support JSX through the compiler AST rather than assuming a specific emitted factory name whenever possible.

For an initial release, JSX support may be marked experimental and restricted to configurations using Mithril’s hyperscript factory.

Example:

```tsx
/** @jsx m */
const View = () => <section><h1>Hello</h1></section>
```

The transform must preserve source maps through any chained JSX transformations.

Document plugin-order requirements for Vite.

## 6.7 Source maps

Return valid high-resolution source maps.

The editor location must refer to the original `.ts`, `.tsx`, `.js` or `.jsx` file, not generated Vite output.

Add tests that chain the inspector transform with:

* TypeScript transformation;
* JSX transformation;
* another source-map-producing plugin.

---

# 7. Runtime model

## 7.1 Global hook

Expose one development-only global hook:

```ts
declare global {
  interface Window {
    __MITHRIL_INSPECTOR__?: MithrilInspectorHook
  }
}
```

Use a stable protocol version:

```ts
export interface MithrilInspectorHook {
  protocolVersion: 1
  runtimeVersion: string
  registerModule(module: ModuleRecord): void
  registerComponent(record: ComponentRecord): ComponentId
  registerVNode(record: VNodeRecord): VNodeId
  associateDom(record: DomAssociation): void
  disposeVNode(vnodeId: VNodeId): void
  subscribe(listener: InspectorListener): () => void
  getSnapshot(): InspectorSnapshot
}
```

Do not expose application objects unnecessarily through enumerable window properties.

## 7.2 IDs

Use stable IDs for a mounted component instance for the duration of that instance.

Example:

```ts
type ComponentId = `c:${number}`
type VNodeId = `v:${number}`
type ModuleId = `m:${string}`
```

A component ID must not change on every redraw.

A vnode ID may change when Mithril creates a new vnode.

## 7.3 Component records

```ts
export interface ComponentRecord {
  id: ComponentId
  parentId: ComponentId | null
  displayName: string
  source: SourceLocation | null
  kind:
    | "object"
    | "closure"
    | "class"
    | "function"
    | "route-resolver"
    | "anonymous"
  attrs: unknown
  state: unknown
  mounted: boolean
  createdAt: number
  updatedAt: number
  updateCount: number
  domRange: DomRange | null
  childIds: ComponentId[]
}
```

Attrs and state should initially be read-only snapshots or references displayed through a safe serializer.

## 7.4 Safe serialization

The inspector must handle:

* circular references;
* functions;
* DOM nodes;
* symbols;
* bigints;
* maps;
* sets;
* typed arrays;
* errors;
* promises;
* getters that throw;
* proxy objects;
* deep or very large objects.

Do not use unrestricted `JSON.stringify`.

Implement a lazy object inspector with:

* maximum initial depth;
* maximum entries per page;
* getter values evaluated only after explicit user action;
* circular-reference labels;
* redaction hooks.

## 7.5 Vnode ownership

Track which component produced each vnode.

A vnode produced inside `Component.view` belongs to that mounted component until a nested component vnode begins another ownership scope.

Conceptual stack:

```ts
enterComponent(componentInstance)
try {
  const result = originalView(vnode)
  recordOwnedVNodes(componentInstance, result)
  return result
} finally {
  leaveComponent(componentInstance)
}
```

Do not rely solely on JavaScript call-stack interception of the global `m` function. That approach is fragile when applications import multiple Mithril instances or pre-create vnodes outside a view.

Prefer build-time source markers combined with wrapped component view boundaries.

## 7.6 DOM association

Mithril vnodes may represent:

* a single element;
* a text node;
* a trusted HTML fragment;
* an array fragment;
* a component returning multiple nodes;
* no DOM;
* temporarily detached DOM.

Represent output as a DOM range:

```ts
export interface DomRange {
  first: Node | null
  last: Node | null
}
```

For an element vnode, `first` and `last` are the same node.

For a fragment, store the first and last rendered nodes.

Use `WeakMap<Node, DomOwnership[]>` to map DOM nodes to:

* nearest source expression;
* producing vnode;
* owning component;
* component ancestry.

A DOM node may have more than one relevant component ancestor.

## 7.7 Lifecycle integration

Use Mithril vnode lifecycle hooks only where they can be composed safely.

When injecting or wrapping hooks:

* call existing application hooks;
* preserve `this`;
* preserve return values;
* preserve ordering;
* do not swallow exceptions;
* do not modify `vnode.state`;
* clean mappings during removal.

Test all lifecycle methods:

```text
oninit
oncreate
onbeforeupdate
onupdate
onbeforeremove
onremove
```

Async `onbeforeremove` behavior must remain intact.

---

# 8. Inspector overlay

## 8.1 General appearance

Create a fixed tab at the bottom-right by default.

Collapsed form:

```text
┌──────────────────┐
│ ◇ Mithril Inspect │
└──────────────────┘
```

Requirements:

* unobtrusive;
* visible above normal application content;
* configurable position;
* movable when it conflicts with application UI;
* remembers its position and collapsed state in local storage;
* supports dark and light appearance;
* follows the browser’s color scheme by default;
* renders inside a shadow root to avoid CSS conflicts;
* uses no global styles;
* does not consume pointer events outside its visible region.

## 8.2 Shadow DOM host

Mount the overlay in:

```html
<div id="__mithril-inspector-host"></div>
```

Attach an open shadow root unless configuration requests a closed one.

The host must be excluded from element picking and runtime component tracking.

## 8.3 Main panel

Expanded panel tabs:

```text
[ Inspector ] [ Components ] [ Settings ]
```

MVP Inspector panel:

```text
Selected
────────────────────────────────
Component   UserCard
Element     article.user-card
Source      src/UserCard.ts:17:5
Mapping     Exact element source

[Open in editor] [Reveal component]
────────────────────────────────
Component ancestry
App
└─ UserList
   └─ UserCard

Attrs
▸ user
▸ onEdit

State
▸ loading
▸ expanded
```

## 8.4 Picker behavior

Inspection mode may be activated by:

* clicking “Select element”;
* the configurable keyboard shortcut;
* holding a modifier-key combination.

Suggested defaults:

```text
Toggle picker: Alt+Shift+M
Momentary picker: Alt+Shift
Open selected source: Enter
Cancel picker: Escape
```

Do not bind plain Alt+Click by default because operating systems and browsers use Alt-click for other behavior.

Allow configuration:

```ts
picker: {
  toggleShortcut: "Alt+Shift+M",
  holdShortcut: "Alt+Shift",
  openOnClick: true,
}
```

## 8.5 Hover behavior

While the picker is active:

1. listen to pointer movement in the capture phase;
2. use `document.elementsFromPoint`;
3. ignore the overlay host and overlay descendants;
4. select the first eligible application element;
5. find the best source/component mapping;
6. draw a highlight without changing target-element styles;
7. show an information badge.

Badge example:

```text
UserCard
article.user-card
src/components/UserCard.ts:17
```

## 8.6 Highlight overlay

Do not modify the inspected element’s inline style.

Render separate fixed-position overlay rectangles.

The highlight must:

* follow scrolling;
* update on resize;
* support transformed elements;
* use `getBoundingClientRect`;
* show margins and padding only in a later release;
* disappear immediately when picker mode ends.

Use `requestAnimationFrame` to throttle pointer and layout work.

## 8.7 Selection behavior

On click in picker mode:

* prevent the application click by default;
* stop propagation;
* select the mapped element;
* freeze the current highlight;
* show the details panel — except when the click also opens the source via
  the open-editor modifier (see below), where the panel stays as-is by
  default (configurable: `picker.openPanelOnEditorOpen`);
* optionally open the source immediately based on settings;
* leave picker mode unless “continuous inspection” is enabled.

Provide an alternative modifier allowing the application click to pass through.

## 8.8 Stale nodes

When a selected node is removed after a redraw:

* retain the component/source record;
* show “Element no longer mounted”;
* offer to select the nearest currently mounted ancestor;
* do not keep strong references that prevent garbage collection.

---

# 9. Component tree

## 9.1 Tree semantics

The tree is a Mithril component tree, not a DOM tree.

Example:

```text
App
├─ Header
│  └─ UserMenu
├─ RouterOutlet
│  └─ UsersPage
│     ├─ FilterPanel
│     └─ UserList
│        ├─ UserCard key="42"
│        └─ UserCard key="84"
└─ Footer
```

Do not include ordinary HTML elements in the default component tree.

Optionally allow expansion of a component into its owned vnode/element tree.

## 9.2 Display names

Resolve component names in this order:

1. explicit inspector display name;
2. `component.displayName`;
3. variable or export name discovered by the AST transform;
4. class name;
5. function name;
6. filename-derived name;
7. `Anonymous`.

Support:

```ts
UserCard.displayName = "UserCard"
```

and:

```ts
defineInspectorName(UserCard, "UserCard")
```

## 9.3 Selection synchronization

Selecting a DOM node must select its nearest component.

Selecting a component in the tree must:

* highlight its rendered DOM range;
* scroll its first DOM node into view on request;
* show source, attrs and state;
* allow opening its declaration or view source.

When multiple source locations are available, offer:

```text
Open:
- rendered element
- component view
- component declaration
```

Default to the most precise rendered-element source.

## 9.4 Tree updates

Do not rebuild the entire UI tree on every mouse move or application redraw.

Runtime updates should be emitted as batched events:

```ts
type RuntimeEvent =
  | { type: "components-added"; records: ComponentRecord[] }
  | { type: "components-updated"; records: ComponentPatch[] }
  | { type: "components-removed"; ids: ComponentId[] }
  | { type: "dom-associated"; records: DomAssociation[] }
  | { type: "reset" }
```

Batch updates using a microtask or animation frame.

---

# 10. Open-in-editor server

## 10.1 Endpoint

For Vite, add development middleware:

```http
POST /__mithril-inspector/open-in-editor
Content-Type: application/json
```

Request:

```json
{
  "file": "src/components/UserCard.ts",
  "line": 17,
  "column": 5
}
```

Response:

```json
{
  "ok": true
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "FILE_OUTSIDE_ROOT",
    "message": "The requested file is outside the configured project root."
  }
}
```

## 10.2 Security requirements

The endpoint must:

* be registered only in development mode;
* accept POST only;
* accept JSON only;
* reject oversized bodies;
* resolve paths against configured project roots;
* reject path traversal;
* reject files outside allowed roots;
* reject nonexistent files;
* reject directories;
* validate line and column as positive bounded integers;
* bind to the existing development server only;
* not accept arbitrary commands;
* not pass unsanitized values to a shell;
* use a maintained editor-launch library or `spawn` with argument arrays;
* avoid `exec` and shell interpolation.

Do not implement:

```ts
exec(`code -g ${file}:${line}`)
```

Use argument-safe process spawning.

## 10.3 Editor selection

Configuration:

```ts
mithrilInspector({
  editor: "code",
})
```

Supported aliases:

```text
code
code-insiders
cursor
windsurf
webstorm
idea
subl
vim
nvim
```

Also support:

```ts
editor: {
  command: "/custom/path/to/editor",
  args: ({ file, line, column }) => [
    "--goto",
    `${file}:${line}:${column}`,
  ],
}
```

Environment-variable fallback:

```text
MITHRIL_INSPECTOR_EDITOR
LAUNCH_EDITOR
VISUAL
EDITOR
```

## 10.4 Remote environments

Provide path mapping for:

* WSL;
* Docker;
* SSH;
* devcontainers;
* monorepos.

Example:

```ts
pathMappings: [
  {
    from: "/workspace",
    to: "/Users/erik/projects/app",
  },
]
```

Path mapping occurs after validation against the development-server root but before invoking the editor.

---

# 11. Vite plugin

## 11.1 API

```ts
export interface MithrilInspectorOptions {
  enabled?: boolean
  includeInProduction?: boolean

  include?: FilterPattern
  exclude?: FilterPattern

  root?: string
  projectRoots?: string[]

  editor?: EditorOption
  pathMappings?: PathMapping[]

  ui?: {
    enabled?: boolean
    position?:
      | "bottom-right"
      | "bottom-left"
      | "top-right"
      | "top-left"
    defaultOpen?: boolean
    theme?: "system" | "light" | "dark"
    zIndex?: number
  }

  picker?: {
    enabled?: boolean
    toggleShortcut?: string
    holdShortcut?: string
    openOnClick?: boolean
    continuous?: boolean
  }

  componentTree?: {
    enabled?: boolean
    captureAttrs?: boolean
    captureState?: boolean
  }

  source?: {
    elements?: boolean
    components?: boolean
    attributes?: boolean
    textExpressions?: boolean
    exposeDomAttributes?: boolean
  }

  mithrilImports?: string[]
  hyperscriptIdentifiers?: string[]

  debug?: boolean
}

export function mithrilInspector(
  options?: MithrilInspectorOptions,
): import("vite").Plugin[]
```

Returning a plugin array is acceptable when separating:

* pre-transform;
* runtime injection;
* middleware;
* HTML injection.

## 11.2 Vite hooks

Use appropriate Vite hooks:

```text
configResolved
configureServer
resolveId
load
transform
transformIndexHtml
handleHotUpdate
```

Responsibilities:

### `configResolved`

* determine root;
* resolve include/exclude filters;
* determine development mode;
* normalize options.

### `resolveId` and `load`

Serve virtual modules:

```text
virtual:mithril-inspector/runtime
virtual:mithril-inspector/overlay
```

Use internal resolved IDs prefixed with `\0`.

### `transform`

* instrument source files;
* preserve source maps;
* skip `node_modules` by default;
* skip the inspector’s own packages;
* skip generated and declaration files;
* cache results by file content and options.

### `transformIndexHtml`

Inject the overlay bootstrap into development pages.

Do not require the application entry file to be modified.

### `configureServer`

Register the open-in-editor endpoint and optional diagnostic endpoint.

### `handleHotUpdate`

* invalidate module metadata;
* notify the runtime of replaced source records;
* preserve current UI selection when possible;
* remove stale source registrations.

## 11.3 Plugin order

Set `enforce: "pre"` for transforms that must see original TypeScript/JSX syntax.

Where cooperation with another JSX plugin requires a different phase, split the plugin into pre- and post-transform parts.

Document the intended order.

---

# 12. Bundler-neutral design

## 12.1 Shared transform

All adapters must call the same `transformMithrilModule` function.

## 12.2 Shared middleware

Expose a Connect-compatible handler where possible:

```ts
export function createInspectorMiddleware(
  options: InspectorServerOptions,
): Connect.NextHandleFunction
```

Also expose a framework-neutral request handler:

```ts
export async function handleInspectorRequest(
  request: InspectorRequest,
  options: InspectorServerOptions,
): Promise<InspectorResponse>
```

## 12.3 Rollup

The Rollup adapter supports:

* AST transformation;
* runtime import resolution;
* development watch mode;
* source maps.

Because Rollup itself is not normally a development server, editor launching requires either:

* integration with a compatible dev server;
* a separately started inspector server;
* configuration of an endpoint URL.

## 12.4 esbuild

Implement an esbuild plugin using:

```ts
build.onResolve(...)
build.onLoad(...)
build.onEnd(...)
```

The esbuild adapter must support transformation and runtime injection.

A helper development server may be provided for open-in-editor.

## 12.5 Webpack and Rspack

Implement later using:

* loader for module transformation;
* plugin for virtual/runtime entry injection;
* dev-server middleware for editor launching.

Do not make the runtime depend on Vite-specific APIs.

---

# 13. Optional DOM metadata mode

Offer a debugging option:

```ts
source: {
  exposeDomAttributes: true,
}
```

When enabled, add compact attributes such as:

```html
<article data-mi="m17:s2"></article>
```

Do not expose absolute paths.

This mode is useful for:

* manually inspecting mappings;
* browser extensions;
* integration testing;
* applications that need DOM-level diagnostic visibility.

It must be disabled by default.

---

# 14. Public runtime API

Support unusual application patterns through an optional API:

```ts
import {
  inspectComponent,
  inspectSource,
  setInspectorDisplayName,
} from "@mithril-inspector/runtime"

const Component = inspectComponent(
  {
    view: () => m("div"),
  },
  {
    name: "Component",
    source: import.meta.url,
  },
)
```

Also support excluding sensitive or noisy components:

```ts
markInspectorHidden(ThirdPartyWidget)
```

And redacting attrs/state:

```ts
setInspectorSerializer(Component, {
  attrs(attrs) {
    return {
      ...attrs,
      password: "[redacted]",
    }
  },
})
```

---

# 15. Privacy and sensitive data

Attrs and state can contain credentials, personal data or large domain objects.

Default behavior:

* display values only locally;
* never send component data to the development server;
* never persist attrs or state;
* never expose them in DOM attributes;
* do not log them to the console;
* redact keys matching configurable patterns.

Default redaction patterns:

```text
password
passwd
secret
token
authorization
cookie
apiKey
accessToken
refreshToken
```

Configuration:

```ts
redact: {
  keys: [/password/i, /token/i],
  replacement: "[redacted]",
}
```

The editor endpoint receives only file, line and column.

---

# 16. Error handling

The tool must never break the host application because the inspector fails.

Runtime errors should:

* be caught at inspector boundaries;
* appear in an inspector diagnostics view;
* optionally log once in debug mode;
* disable only the affected inspector feature;
* leave normal Mithril rendering intact.

Examples:

```text
Could not map this element to a source location.
Component returned no DOM nodes.
Source file was replaced during HMR.
Configured editor could not be launched.
File is outside the permitted project root.
Multiple Mithril runtimes were detected.
```

---

# 17. Performance requirements

Development-mode targets for a representative medium application:

* less than 10% median redraw overhead with source inspection enabled;
* less than 20% median redraw overhead with full component tracking enabled;
* no full-page DOM scans during ordinary redraws;
* pointer inspection updates capped at one per animation frame;
* overlay idle CPU usage near zero;
* all node mappings weakly referenced where possible;
* stale component records cleaned after unmount;
* transform cache keyed by file content and relevant options.

Provide three modes:

```ts
mode: "source"
mode: "components"
mode: "full"
```

Definitions:

### `source`

Element-to-source mapping and editor navigation only.

### `components`

Component hierarchy and component source mapping.

### `full`

Element source mapping, hierarchy, attrs, state and diagnostics.

Default to `"source"` for the first release if full tracking is not yet sufficiently reliable.

---

# 18. Accessibility

The overlay must:

* be keyboard navigable;
* use semantic controls;
* provide visible focus indicators;
* support screen readers;
* meet WCAG AA contrast;
* not trap focus when collapsed;
* return focus after dialogs close;
* respect reduced-motion preferences;
* allow all shortcuts to be changed or disabled.

The picker must have a clear visual indication that normal page interaction is temporarily intercepted.

---

# 19. Testing strategy

## 19.1 Unit tests with Vitest

Test packages independently.

### Transform tests

Use fixture-based snapshot tests for:

* aliased Mithril imports;
* object components;
* closure components;
* class components;
* anonymous components;
* nested `m(...)` calls;
* fragments;
* arrays;
* keyed lists;
* trusted HTML;
* JSX/TSX;
* comments and unusual formatting;
* source-map correctness;
* unrelated `m` bindings;
* files without Mithril;
* HMR transformations;
* syntax errors.

Do not rely solely on transformed-code snapshots. Execute transformed fixtures where possible.

### Runtime tests

Use a DOM implementation for:

* component registration;
* parent-child ownership;
* vnode ownership;
* DOM ranges;
* mount/update/remove;
* weak-map lookup;
* multiple roots;
* stale selections;
* safe serialization;
* redaction;
* event batching.

### Server tests

Test:

* successful editor requests with a mocked launcher;
* path traversal;
* absolute paths outside root;
* symlinks escaping root;
* nonexistent files;
* invalid line/column;
* unsupported method;
* malformed JSON;
* oversized body;
* custom path mappings;
* editor argument generation.

## 19.2 Browser tests

Create fixture applications covering:

* simple mounted component;
* routing;
* nested components;
* list redraws;
* keyed reordering;
* fragment roots;
* trusted HTML;
* SVG;
* shadow DOM inside the application;
* multiple mount roots;
* HMR;
* component removal;
* scrolling;
* CSS transforms;
* dialogs and high z-index application content.

Automated tests shall verify:

1. the tab appears;
2. picker mode activates;
3. hover displays the correct component;
4. click selects the correct source;
5. the editor endpoint receives the expected file and line;
6. component ancestry is correct;
7. redraws update mappings;
8. removed nodes do not remain selectable;
9. the overlay does not trigger application click handlers;
10. production builds contain no inspector runtime.

Use the available browser testing capability or the user-provided `browsertools` skill for integration testing. Do not require Playwright when the existing browser test tooling can exercise the application reliably.

## 19.3 Compatibility matrix

Test at least:

```text
Mithril: current supported 2.x versions
Vite: current two major versions
Node.js: active LTS versions
Browsers:
- Chromium
- Firefox, once supported
- Safari, best effort for in-page overlay
```

---

# 20. Acceptance criteria

## 20.1 MVP acceptance criteria

The MVP is complete when all of the following work:

1. A developer installs `@mithril-inspector/vite`.
2. They add `mithrilInspector()` to `vite.config.ts`.
3. Running the Vite development server shows a collapsed Mithril Inspector tab.
4. Activating the picker highlights application DOM elements.
5. Hovering an instrumented element shows:

   * element/tag;
   * nearest Mithril component;
   * project-relative source file;
   * source line.
6. Clicking selects the element without triggering its application click handler.
7. “Open in editor” opens VS Code at the correct TypeScript source line.
8. Nested elements map to their own `m(...)` expression rather than only the component declaration.
9. Fragment-root components can be selected through any of their rendered nodes.
10. A basic component ancestry view is available.
11. HMR does not permanently corrupt the component or source registry.
12. Production builds do not contain the overlay, runtime registration or editor endpoint.
13. Existing component attrs and lifecycle hooks are not observably changed.
14. Path traversal and arbitrary command execution are prevented.
15. Tests cover transformations, runtime mappings, editor middleware and browser behavior.

## 20.2 Quality gate

Do not publish an initial stable release until:

* source maps are verified against TypeScript files;
* keyed-list redraws are tested;
* fragment-root components are handled;
* lifecycle composition is tested;
* security tests for the editor endpoint pass;
* the tool is tested against at least two nontrivial Mithril applications.

---

# 21. Implementation phases

## Phase 0 — technical spikes

Create isolated prototypes for the following uncertainties:

1. Reliably associate an instrumented vnode with its resulting DOM node or range.
2. Preserve source maps after TypeScript and JSX transforms.
3. Track mounted component instances without changing `vnode.state`.
4. Handle fragment-root components.
5. Preserve existing lifecycle hook behavior.
6. Maintain mappings across HMR.

Do not build the complete UI before these spikes succeed.

Deliver a short architectural decision record for each spike.

## Phase 1 — source inspector

Implement:

* AST source instrumentation;
* runtime source registry;
* DOM/source association;
* picker;
* highlight;
* source tooltip;
* Vite editor middleware;
* open in VS Code;
* collapsed bottom tab.

This is the first publishable alpha.

Suggested package version:

```text
0.1.0-alpha.1
```

## Phase 2 — component ancestry

Implement:

* mounted component-instance IDs;
* parent-child tracking;
* component display names;
* nearest-component lookup;
* ancestry panel;
* reveal component source.

## Phase 3 — full component tree

Implement:

* expandable tree;
* selection synchronization;
* mount/update/unmount events;
* search;
* attrs and state views;
* safe serializer;
* redaction.

## Phase 4 — bundler adapters

Extract and verify:

* Rollup;
* esbuild;
* Webpack/Rspack.

## Phase 5 — advanced diagnostics

Consider:

* redraw flash;
* update count;
* render timing;
* slow-component warnings;
* route inspection;
* optional Chrome DevTools extension bridge.

---

# 22. Recommended technical choices

Use:

* TypeScript with strict compiler settings;
* modern ESM packages;
* pnpm workspaces;
* Vitest;
* Mithril.js for the overlay;
* Shadow DOM for visual isolation;
* a proven JavaScript/TypeScript parser and code generator;
* MagicString or an equivalent source-map-aware transformation utility;
* weak maps for vnode and DOM ownership;
* a maintained editor-launch package or safe `spawn`;
* Vite virtual modules.

Parser selection should be based on the transformation requirements.

Acceptable options include:

* Babel parser and traverse;
* SWC;
* TypeScript compiler API;
* Acorn with appropriate plugins;
* Oxc when its transformation/source-map APIs meet all requirements.

Prefer correctness and source-map quality over maximum transformation speed in the first release.

Do not implement the source transform using regular expressions.

---

# 23. Important architectural decisions

## ADR-001: In-page overlay before Chrome extension

Implement the in-page overlay first.

Reasons:

* works in Chromium, Firefox and Safari;
* no extension-store installation;
* easier local development;
* easier Vite integration;
* easier editor-server communication;
* UI can later be reused in a DevTools extension.

## ADR-002: Weak-map metadata before DOM attributes

Use runtime associations as the normal mechanism.

Optional compact DOM IDs may be enabled for diagnostics.

Reasons:

* no filesystem paths exposed in markup;
* no CSS-selector interference;
* no snapshot pollution;
* supports richer many-to-one mappings;
* works with component ancestry.

## ADR-003: Source inspector before full component tree

Deliver element-to-source navigation first.

Reasons:

* immediately valuable;
* technically lower risk;
* does not require complete component ownership semantics;
* creates the transform/runtime infrastructure needed by the tree inspector.

## ADR-004: Bundler-neutral packages with Vite-first integration

Keep the AST transform, runtime, overlay and editor launcher independent from Vite.

Vite remains the reference integration and receives the best initial developer experience.

## ADR-005: No global replacement of `m`

Do not solve instrumentation by globally monkey-patching Mithril’s exported `m` function alone.

Reasons:

* ESM bindings and bundled copies complicate replacement;
* applications may use multiple Mithril instances;
* vnodes may be created outside component views;
* source lines cannot be recovered reliably at runtime;
* component ownership would remain ambiguous.

Use build-time instrumentation plus controlled runtime wrappers.

---

# 24. Example user experience

Installation:

```sh
pnpm add -D @mithril-inspector/vite
```

Configuration:

```ts
import { defineConfig } from "vite"
import { mithrilInspector } from "@mithril-inspector/vite"

export default defineConfig({
  plugins: [
    mithrilInspector({
      editor: "code",
      mode: "full",
      ui: {
        position: "bottom-right",
        theme: "system",
      },
    }),
  ],
})
```

Workflow:

1. Run `pnpm dev`.
2. Open the application.
3. Click the “Mithril Inspect” tab.
4. Click the element-picker button.
5. Hover over a button in the application.
6. See:

```text
SaveButton
button.btn.primary
src/components/SaveButton.ts:28:7
```

7. Click the button.
8. The application click is suppressed.
9. The inspector displays the owning component and its ancestry.
10. Click “Open in editor”.
11. VS Code opens:

```text
src/components/SaveButton.ts:28:7
```

---

# 25. Codex execution instructions

Implement this project incrementally.

For each phase:

1. Add or update an architectural decision record.
2. Write failing tests before implementing complex transform or lifecycle behavior.
3. Keep packages independently testable.
4. Avoid importing Vite from core packages.
5. Run unit tests after every meaningful change.
6. Run browser integration tests before completing a milestone.
7. Test against the included playground application.
8. Keep the repository in a runnable state.
9. Do not silently omit difficult cases; document unsupported cases.
10. Do not claim component-tree correctness until keyed redraws, fragments, multiple roots and unmount cleanup are tested.

Begin with Phase 0 and Phase 1.

The first concrete deliverable shall be a working Vite playground in which clicking an instrumented Mithril-rendered element opens the exact original TypeScript source line in VS Code.

After that works reliably, implement component-instance tracking and the component tree.

