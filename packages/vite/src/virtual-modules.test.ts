import { describe, expect, it } from "vitest"

import { HMR_INVALIDATE_EVENT } from "./hmr.js"
import { OVERLAY_MODULE_ID, RESOLVED_OVERLAY_ID, RESOLVED_RUNTIME_ID, RUNTIME_MODULE_ID } from "./ids.js"
import { resolveInspectorOptions, toOverlayOptionsInput, toRuntimeBootstrapConfig } from "./options.js"
import { loadVirtualModule, overlayModuleCode, resolveVirtualId, runtimeModuleCode } from "./virtual-modules.js"

const resolved = resolveInspectorOptions(
  { mode: "components", source: { exposeDomAttributes: true }, ui: { position: "top-left" } },
  { NODE_ENV: "development" },
)

describe("resolveVirtualId", () => {
  it("maps the public runtime/overlay ids to their NUL-prefixed resolved ids (§11.2)", () => {
    expect(resolveVirtualId(RUNTIME_MODULE_ID)).toBe(RESOLVED_RUNTIME_ID)
    expect(resolveVirtualId(OVERLAY_MODULE_ID)).toBe(RESOLVED_OVERLAY_ID)
  })

  it("ignores unrelated ids", () => {
    expect(resolveVirtualId("mithril")).toBeNull()
    expect(resolveVirtualId(RESOLVED_RUNTIME_ID)).toBeNull()
  })
})

describe("runtimeModuleCode", () => {
  const code = runtimeModuleCode(toRuntimeBootstrapConfig(resolved))

  it("re-exports the three transform-facing helpers so instrumented imports resolve (§6.1)", () => {
    expect(code).toContain("registerModule")
    expect(code).toContain("source")
    expect(code).toContain("component")
    expect(code).toContain('from "@mithril-inspector/runtime"')
  })

  it("installs a configured runtime on the global hook exactly once", () => {
    expect(code).toContain("createRuntime")
    expect(code).toContain("__MITHRIL_INSPECTOR__")
    expect(code).toContain('"mode":"components"')
    expect(code).toContain('"exposeDomAttributes":true')
  })

  it("registers the HMR invalidation handler (ADR-106)", () => {
    expect(code).toContain("import.meta.hot")
    expect(code).toContain(HMR_INVALIDATE_EVENT)
    expect(code).toContain("invalidateModule")
  })
})

describe("overlayModuleCode", () => {
  const code = overlayModuleCode(toOverlayOptionsInput(resolved))

  it("imports the runtime module first so the hook is installed before mount", () => {
    expect(code).toContain(`import ${JSON.stringify(RUNTIME_MODULE_ID)}`)
  })

  it("mounts the overlay with the resolved ui options", () => {
    expect(code).toContain("mountInspectorOverlay")
    expect(code).toContain('from "@mithril-inspector/overlay"')
    expect(code).toContain('"position":"top-left"')
  })
})

describe("loadVirtualModule", () => {
  const deps = {
    runtimeConfig: toRuntimeBootstrapConfig(resolved),
    overlayOptions: toOverlayOptionsInput(resolved),
  }

  it("serves the runtime and overlay bootstraps by resolved id", () => {
    expect(loadVirtualModule(RESOLVED_RUNTIME_ID, deps)).toContain("createRuntime")
    expect(loadVirtualModule(RESOLVED_OVERLAY_ID, deps)).toContain("mountInspectorOverlay")
  })

  it("returns null for anything else", () => {
    expect(loadVirtualModule("\0virtual:other", deps)).toBeNull()
    expect(loadVirtualModule(RUNTIME_MODULE_ID, deps)).toBeNull()
  })
})
