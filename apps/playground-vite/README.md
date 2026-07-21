# Vite playground

The manual test bed for Mithril Inspector (task 0014):
a small routed Mithril 2.x + TypeScript app that exercises every §19.2 fixture
scenario, wired up with **zero application-code changes** beyond
`vite.config.ts`:

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { mithrilInspector } from "@mithril-inspector/vite"

export default defineConfig({
  plugins: [mithrilInspector()],
})
```

## Run it

```sh
pnpm install
pnpm --filter @mithril-inspector/playground-vite dev
```

Open the printed local URL. You should see:

1. A collapsed **◇ Mithril Inspect** tab near the bottom-right.
2. Click it to expand the panel, then **Select element** to activate the
   picker.
3. Hover any instrumented element (e.g. the "Increment" button on the home
   route) — a badge shows the component name, tag, and
   `src/....ts:line:col`.
4. Click it: the application's own `onclick` is suppressed (the counter does
   *not* increment), and the panel shows the selected component/source
   details instead.
5. Click **Open in editor**. By default (no `editor` option, no
   `EDITOR`/`VISUAL`/`LAUNCH_EDITOR`/`MITHRIL_INSPECTOR_EDITOR` env var) the
   endpoint correctly reports "no editor configured" rather than guessing
   (§10.3) — this is the intended zero-config behavior, not a bug. To see it
   actually open VS Code at the exact original `.ts` line, run with an editor
   configured, e.g.:

   ```sh
   EDITOR=code pnpm --filter @mithril-inspector/playground-vite dev
   ```

   or set `mithrilInspector({ editor: "code" })` in `vite.config.ts`.

## Routes / scenarios covered (§19.2)

| Route             | File                              | Exercises                                              |
| ----------------- | ---------------------------------- | ------------------------------------------------------- |
| `/`                | `src/pages/home-page.ts`           | simple mounted + nested components (object component)   |
| `/list`            | `src/pages/list-page.ts`           | list redraws, keyed reordering, component removal (closure) |
| `/fragment`        | `src/pages/fragment-page.ts`       | fragment-root component (array `view` return)            |
| `/trusted-html`    | `src/pages/trusted-html-page.ts`   | trusted HTML (`m.trust`)                                  |
| `/svg`             | `src/pages/svg-page.ts`            | inline SVG                                                |
| `/shadow-dom`      | `src/pages/shadow-dom-page.ts`     | in-app shadow DOM (distinct from the overlay's own host)  |
| `/dialog`          | `src/pages/dialog-page.ts`         | dialog / high z-index content (**class** component)       |
| `/scroll`          | `src/pages/scroll-page.ts`         | scrolling content                                         |
| `/transform`       | `src/pages/transform-page.ts`      | CSS transforms (rotate/scale/translate)                   |

Two more scenarios aren't routes:

- **Routing** itself — `src/services/routing-service.ts` builds the `m.route`
  table (structural inspiration from
  [erikvullings/mithril-app](https://github.com/erikvullings/mithril-app)'s
  `RoutingService`/`Layout` pattern).
- **Multiple mount roots** — `src/status-widget.ts` is mounted independently
  via a second `m.mount()` call in `main.ts`, next to the router's root.

The mix of component forms (§6.5) required by the task is: **object**
(`Greeting`, `HomePage`, `FragmentPage`, `TrustedHtmlPage`, `SvgPage`,
`ScrollPage`, `TransformPage`, `Layout`, `StatusWidget`), **closure**
(`Counter`, `ListPage`, `ShadowDomPage`, `Nav` — written as
`const X = () => {...}`, not `function X() {...}`, since only the closure
form is fully lifecycle-wrapped in Phase 1), and **class**
(`DialogPage`).

## Production build is inspector-free

```sh
pnpm --filter @mithril-inspector/playground-vite build
grep -r "__MITHRIL_INSPECTOR__\|__miRegisterModule\|__miSource\|mountInspectorOverlay\|virtual:mithril-inspector\|open-in-editor" dist
# no matches
```

## Known limitation: the `/dialog` route

Opening the native `<dialog>` on this route via `showModal()` blocks the
inspector overlay entirely — the browser promotes the dialog into the "top
layer," which paints above the overlay regardless of z-index and makes the
rest of the page inert to both pointer and keyboard input while it's open.
Closing the dialog restores the overlay. This is a known Phase-1 limitation
(not a bug); see `@mithril-inspector/overlay`'s README for the full
explanation. The overlay detects it via the `:modal` CSS pseudo-class and
records a `"modal-dialog"` diagnostic, visible in the Settings panel once the
dialog closes.

## HMR

Edit any page/component's text while `pnpm dev` is running. Mithril has no
HMR-integration plugin of its own, so the edit propagates via Vite's default
full-reload fallback (logged as `page reload src/...`) — the honest,
representative HMR event for a plain Mithril app (see 0015's agent notes).
Source mappings remain correct after the reload, including across line-number
shifts.
