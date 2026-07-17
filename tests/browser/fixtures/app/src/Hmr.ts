import m from "mithril"
import type { Component } from "mithril"

/**
 * Edited on disk by the HMR test (§19.2 "HMR"). Mithril has no HMR-integration
 * plugin of its own, so — since nothing in the import chain up to `main.ts`
 * calls `import.meta.hot.accept()` — Vite's default propagation falls back to
 * a full page reload on an edit; that reload is the real, representative HMR
 * event for this app, and the test proves the source mapping is still
 * accurate afterward (ADR-106 module invalidation/re-registration).
 */
export const HmrScene: Component = {
  view: () => m("p#hmr-text", "HMR original text"),
}
