import type { OverlayOptionsInput } from "@mithril-inspector/overlay"

import { HMR_INVALIDATE_EVENT } from "./hmr.js"
import {
  OVERLAY_MODULE_ID,
  RESOLVED_OVERLAY_ID,
  RESOLVED_RUNTIME_ID,
  RUNTIME_MODULE_ID,
} from "./ids.js"
import type { RuntimeBootstrapConfig } from "./options.js"

/** Map a public virtual specifier to its NUL-prefixed resolved id, or `null` (§11.2). */
export function resolveVirtualId(id: string): string | null {
  if (id === RUNTIME_MODULE_ID) return RESOLVED_RUNTIME_ID
  if (id === OVERLAY_MODULE_ID) return RESOLVED_OVERLAY_ID
  return null
}

/**
 * The runtime bootstrap module (served for {@link RUNTIME_MODULE_ID}). It
 * re-exports the three transform-facing helpers — so every instrumented module's
 * injected `import { registerModule, source, component } from
 * "virtual:mithril-inspector/runtime"` resolves (§6.1) — and, as a side effect,
 * installs a runtime configured with `mode`/`debug`/`exposeDomAttributes`/`redact`
 * on the global hook before any module registers. It also wires the HMR
 * invalidation channel (ADR-106).
 */
export function runtimeModuleCode(config: RuntimeBootstrapConfig): string {
  return `import { createRuntime } from "@mithril-inspector/runtime";
export { registerModule, source, component } from "@mithril-inspector/runtime";

const __miConfig = ${JSON.stringify(config)};
const __miScope = /* global hook host */ typeof globalThis !== "undefined" ? globalThis : window;
if (!__miScope.__MITHRIL_INSPECTOR__) {
  __miScope.__MITHRIL_INSPECTOR__ = createRuntime(__miConfig);
}

if (import.meta.hot) {
  import.meta.hot.on(${JSON.stringify(HMR_INVALIDATE_EVENT)}, (data) => {
    const hook = __miScope.__MITHRIL_INSPECTOR__;
    if (!hook || typeof hook.invalidateModule !== "function" || !data || !Array.isArray(data.moduleIds)) return;
    for (const moduleId of data.moduleIds) hook.invalidateModule(moduleId);
  });
}
`
}

/**
 * The overlay bootstrap module (served for {@link OVERLAY_MODULE_ID}, injected
 * into the page by `transformIndexHtml`). It imports the runtime module first so
 * the hook is installed even before the first instrumented app module runs, then
 * mounts the shadow-root overlay once the DOM is ready (§8.1, §8.2). Mount
 * failures are swallowed so the inspector never breaks the host page (§16).
 */
export function overlayModuleCode(overlay: OverlayOptionsInput): string {
  return `import ${JSON.stringify(RUNTIME_MODULE_ID)};
import { mountInspectorOverlay } from "@mithril-inspector/overlay";

const __miOverlayOptions = ${JSON.stringify(overlay)};
const __miStart = () => {
  try {
    mountInspectorOverlay(__miOverlayOptions);
  } catch (error) {
    if (typeof console !== "undefined") console.error("[mithril-inspector] overlay failed to mount", error);
  }
};

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", __miStart, { once: true });
  } else {
    __miStart();
  }
}

if (import.meta.hot) import.meta.hot.accept();
`
}

export interface VirtualModuleDeps {
  readonly runtimeConfig: RuntimeBootstrapConfig
  readonly overlayOptions: OverlayOptionsInput
}

/** Serve a virtual module's source by its resolved id, or `null` (§11.2). */
export function loadVirtualModule(resolvedId: string, deps: VirtualModuleDeps): string | null {
  if (resolvedId === RESOLVED_RUNTIME_ID) return runtimeModuleCode(deps.runtimeConfig)
  if (resolvedId === RESOLVED_OVERLAY_ID) return overlayModuleCode(deps.overlayOptions)
  return null
}
