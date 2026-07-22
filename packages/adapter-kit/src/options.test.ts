import { describe, expect, it } from "vitest"

import {
  DEFAULT_REDACT_KEYS,
  resolveInspectorOptions,
  toOverlayOptionsInput,
  toRuntimeBootstrapConfig,
  toServerOptions,
  toTransformOptions,
} from "./options.js"

describe("resolveInspectorOptions", () => {
  it("applies development-first defaults (§2.1, §11.1, §17)", () => {
    const resolved = resolveInspectorOptions({}, { NODE_ENV: "development" })
    expect(resolved.enabled).toBe(true)
    expect(resolved.includeInProduction).toBe(false)
    expect(resolved.mode).toBe("full")
    expect(resolved.debug).toBe(false)
    expect(resolved.ui).toEqual({
      enabled: true,
      defaultOpen: false,
      theme: "system",
    })
    expect(resolved.picker).toEqual({
      enabled: true,
      toggleShortcut: "Alt+Shift+M",
      holdShortcut: "Alt",
      openOnClick: false,
      continuous: false,
    })
    expect(resolved.componentTree).toEqual({ enabled: true, captureAttrs: true, captureState: true })
    expect(resolved.redrawFlash).toEqual({ enabled: false })
    expect(resolved.elementsPane).toEqual({ showTagName: true })
    expect(resolved.source).toEqual({
      elements: true,
      components: true,
      attributes: false,
      textExpressions: false,
      exposeDomAttributes: false,
    })
    expect(resolved.mithrilImports).toEqual(["mithril"])
    expect(resolved.hyperscriptIdentifiers).toEqual(["m"])
    expect(resolved.projectRoots).toEqual([])
    expect(resolved.pathMappings).toEqual([])
    expect(resolved.editorCommand).toBe("code")
  })

  it("resolves editorCommand from an explicit editor option, overriding env vars (§10.3)", () => {
    expect(
      resolveInspectorOptions({ editor: "webstorm" }, { NODE_ENV: "development", EDITOR: "vim" }).editorCommand,
    ).toBe("webstorm")
  })

  it("resolves editorCommand from the environment-variable fallback chain when no editor option is set (§10.3)", () => {
    expect(resolveInspectorOptions({}, { NODE_ENV: "development", EDITOR: "vim" }).editorCommand).toBe("vim")
  })

  it("defaults componentTree.captureAttrs/captureState to true when mode is \"full\" (§17, \"full\" itself means attrs/state)", () => {
    const resolved = resolveInspectorOptions({ mode: "full", componentTree: { enabled: true } }, { NODE_ENV: "development" })
    expect(resolved.componentTree).toEqual({ enabled: true, captureAttrs: true, captureState: true })
  })

  it("does not default captureAttrs/captureState to true for \"source\"/\"components\" modes", () => {
    expect(resolveInspectorOptions({ mode: "source" }, { NODE_ENV: "development" }).componentTree).toEqual({
      enabled: true,
      captureAttrs: false,
      captureState: false,
    })
    expect(resolveInspectorOptions({ mode: "components" }, { NODE_ENV: "development" }).componentTree).toEqual({
      enabled: true,
      captureAttrs: false,
      captureState: false,
    })
  })

  it("lets an explicit captureAttrs/captureState override the mode: \"full\" default", () => {
    const resolved = resolveInspectorOptions(
      { mode: "full", componentTree: { captureState: false } },
      { NODE_ENV: "development" },
    )
    expect(resolved.componentTree).toEqual({ enabled: true, captureAttrs: true, captureState: false })
  })

  it("defaults redrawFlash.enabled to false even in mode: \"full\" (task 0030, opt-in per REQUIREMENTS.md §17/task 0026 — unlike componentTree, mode alone never turns this on)", () => {
    expect(resolveInspectorOptions({ mode: "full" }, { NODE_ENV: "development" }).redrawFlash).toEqual({ enabled: false })
  })

  it("lets redrawFlash be turned on explicitly", () => {
    const resolved = resolveInspectorOptions({ redrawFlash: { enabled: true } }, { NODE_ENV: "development" })
    expect(resolved.redrawFlash).toEqual({ enabled: true })
  })

  it("defaults elementsPane.showTagName to true regardless of mode (task 0031 — a pure display default, not mode-gated like componentTree)", () => {
    expect(resolveInspectorOptions({ mode: "source" }, { NODE_ENV: "development" }).elementsPane).toEqual({ showTagName: true })
  })

  it("lets elementsPane.showTagName be turned off explicitly", () => {
    const resolved = resolveInspectorOptions({ elementsPane: { showTagName: false } }, { NODE_ENV: "development" })
    expect(resolved.elementsPane).toEqual({ showTagName: false })
  })

  it("defaults `enabled` off in production (§2.1)", () => {
    expect(resolveInspectorOptions({}, { NODE_ENV: "production" }).enabled).toBe(false)
  })

  it("lets an explicit `enabled` override NODE_ENV", () => {
    expect(resolveInspectorOptions({ enabled: true }, { NODE_ENV: "production" }).enabled).toBe(true)
    expect(resolveInspectorOptions({ enabled: false }, { NODE_ENV: "development" }).enabled).toBe(false)
  })

  it("wires the default §15 redaction keys and replacement", () => {
    const resolved = resolveInspectorOptions({}, { NODE_ENV: "development" })
    expect(resolved.redact.keys).toEqual(DEFAULT_REDACT_KEYS)
    expect(resolved.redact.keys).toContain("password")
    expect(resolved.redact.keys).toContain("token")
    expect(resolved.redact.replacement).toBe("[redacted]")
  })

  it("honours a custom redaction policy", () => {
    const resolved = resolveInspectorOptions(
      { redact: { keys: ["ssn"], replacement: "***" } },
      { NODE_ENV: "development" },
    )
    expect(resolved.redact).toEqual({ keys: ["ssn"], replacement: "***" })
  })

  it("merges user overrides across every option block", () => {
    const resolved = resolveInspectorOptions(
      {
        includeInProduction: true,
        mode: "full",
        debug: true,
        editor: "cursor",
        projectRoots: ["/repo/pkg-a"],
        pathMappings: [{ from: "/workspace", to: "/Users/dev/app" }],
        include: [/\.ts$/],
        exclude: ["**/vendor/**"],
        ui: { theme: "dark", defaultOpen: true, zIndex: 42 },
        picker: { continuous: true, openOnClick: false, toggleShortcut: "Alt+I" },
        componentTree: { enabled: true, captureAttrs: true, captureState: true },
        source: { exposeDomAttributes: true, attributes: true, textExpressions: true },
        mithrilImports: ["mithril", "@app/m"],
        hyperscriptIdentifiers: ["m", "h"],
      },
      { NODE_ENV: "production" },
    )
    expect(resolved.includeInProduction).toBe(true)
    expect(resolved.mode).toBe("full")
    expect(resolved.debug).toBe(true)
    expect(resolved.editor).toBe("cursor")
    expect(resolved.projectRoots).toEqual(["/repo/pkg-a"])
    expect(resolved.pathMappings).toEqual([{ from: "/workspace", to: "/Users/dev/app" }])
    expect(resolved.ui).toEqual({ enabled: true, theme: "dark", defaultOpen: true, zIndex: 42 })
    expect(resolved.picker.continuous).toBe(true)
    expect(resolved.picker.openOnClick).toBe(false)
    expect(resolved.picker.toggleShortcut).toBe("Alt+I")
    expect(resolved.componentTree).toEqual({ enabled: true, captureAttrs: true, captureState: true })
    expect(resolved.source.exposeDomAttributes).toBe(true)
    expect(resolved.mithrilImports).toEqual(["mithril", "@app/m"])
    expect(resolved.hyperscriptIdentifiers).toEqual(["m", "h"])
  })
})

describe("derived configuration builders", () => {
  it("toRuntimeBootstrapConfig carries only mode/debug/exposeDomAttributes/redact (§15 privacy)", () => {
    const resolved = resolveInspectorOptions(
      { mode: "components", debug: true, source: { exposeDomAttributes: true } },
      { NODE_ENV: "development" },
    )
    expect(toRuntimeBootstrapConfig(resolved)).toEqual({
      mode: "components",
      debug: true,
      exposeDomAttributes: true,
      redact: { keys: DEFAULT_REDACT_KEYS, replacement: "[redacted]" },
    })
  })

  it("toOverlayOptionsInput maps the ui/picker blocks", () => {
    const resolved = resolveInspectorOptions(
      { ui: { enabled: false, zIndex: 10 }, picker: { continuous: true } },
      { NODE_ENV: "development" },
    )
    const overlay = toOverlayOptionsInput(resolved)
    expect(overlay.enabled).toBe(false)
    expect(overlay.zIndex).toBe(10)
    expect(overlay.picker?.continuous).toBe(true)
    expect(overlay.picker?.toggleShortcut).toBe("Alt+Shift+M")
  })

  it("toOverlayOptionsInput maps componentTree, defaulting the tree on (task 0022)", () => {
    const resolved = toOverlayOptionsInput(resolveInspectorOptions({}, { NODE_ENV: "development" }))
    expect(resolved.componentTree).toEqual({ enabled: true, captureAttrs: true, captureState: true })
  })

  it("toOverlayOptionsInput passes through an explicit componentTree opt-in", () => {
    const resolved = resolveInspectorOptions(
      { componentTree: { enabled: true, captureAttrs: true, captureState: false } },
      { NODE_ENV: "development" },
    )
    expect(toOverlayOptionsInput(resolved).componentTree).toEqual({
      enabled: true,
      captureAttrs: true,
      captureState: false,
    })
  })

  it("toOverlayOptionsInput maps redrawFlash, defaulting it off (task 0030)", () => {
    const resolved = toOverlayOptionsInput(resolveInspectorOptions({}, { NODE_ENV: "development" }))
    expect(resolved.redrawFlash).toEqual({ enabled: false })
  })

  it("toOverlayOptionsInput passes through an explicit redrawFlash opt-in", () => {
    const resolved = resolveInspectorOptions({ redrawFlash: { enabled: true } }, { NODE_ENV: "development" })
    expect(toOverlayOptionsInput(resolved).redrawFlash).toEqual({ enabled: true })
  })

  it("toOverlayOptionsInput maps elementsPane, defaulting showTagName on (task 0031)", () => {
    const resolved = toOverlayOptionsInput(resolveInspectorOptions({}, { NODE_ENV: "development" }))
    expect(resolved.elementsPane).toEqual({ showTagName: true })
  })

  it("toOverlayOptionsInput passes through an explicit elementsPane.showTagName override", () => {
    const resolved = resolveInspectorOptions({ elementsPane: { showTagName: false } }, { NODE_ENV: "development" })
    expect(toOverlayOptionsInput(resolved).elementsPane).toEqual({ showTagName: false })
  })

  it("toOverlayOptionsInput passes the resolved editor command through for the Settings tab (§10.3)", () => {
    const resolved = resolveInspectorOptions({ editor: "webstorm" }, { NODE_ENV: "development" })
    expect(toOverlayOptionsInput(resolved).editorCommand).toBe("webstorm")
  })

  it("toServerOptions binds the endpoint to the resolved root and passes editor/mappings (§10.2)", () => {
    const resolved = resolveInspectorOptions(
      { editor: "code", projectRoots: ["/repo/b"], pathMappings: [{ from: "/a", to: "/b" }] },
      { NODE_ENV: "development" },
    )
    expect(toServerOptions(resolved, "/repo/root")).toEqual({
      root: "/repo/root",
      projectRoots: ["/repo/b"],
      editor: "code",
      pathMappings: [{ from: "/a", to: "/b" }],
    })
  })

  it("toServerOptions prefers an explicit `root` option over the Vite root", () => {
    const resolved = resolveInspectorOptions({ root: "/custom" }, { NODE_ENV: "development" })
    expect(toServerOptions(resolved, "/vite/root").root).toBe("/custom")
  })

  it("toTransformOptions targets the virtual runtime module and forwards filters (§11.2)", () => {
    const resolved = resolveInspectorOptions(
      { include: [/\.ts$/], exclude: ["**/x/**"], mithrilImports: ["mithril"], hyperscriptIdentifiers: ["m", "h"] },
      { NODE_ENV: "development" },
    )
    const opts = toTransformOptions(resolved, "/repo/root")
    expect(opts.root).toBe("/repo/root")
    expect(opts.runtimeModule).toBe("virtual:mithril-inspector/runtime")
    expect(opts.sourcemap).toBe(true)
    expect(opts.include).toEqual([/\.ts$/])
    expect(opts.exclude).toEqual(["**/x/**"])
    expect(opts.hyperscriptIdentifiers).toEqual(["m", "h"])
  })
})
