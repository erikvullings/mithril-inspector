import type { InspectorMode, RedactionConfig } from "@mithril-inspector/runtime"
import type { OverlayOptionsInput, OverlayTheme } from "@mithril-inspector/overlay"
import type { EditorOption, InspectorServerOptions, PathMapping } from "@mithril-inspector/server"
import type { FilterPattern, TransformOptions } from "@mithril-inspector/transform"

import { RUNTIME_MODULE_ID } from "./ids.js"

/**
 * The public Vite plugin options (§11.1) plus the performance `mode` (§17, §24)
 * and an optional `redact` policy (§15). Every field is optional so that
 * `mithrilInspector()` works with zero configuration (§2.2).
 */
export interface MithrilInspectorOptions {
  /** Master switch; defaults to `process.env.NODE_ENV !== "production"` (§2.1). */
  enabled?: boolean
  /** Keep the inspector in production builds (off by default, §2.1). */
  includeInProduction?: boolean

  include?: FilterPattern
  exclude?: FilterPattern

  /** Override the project root the editor endpoint validates against (§10.2). */
  root?: string
  /** Additional roots for monorepos (§10.4). */
  projectRoots?: string[]

  editor?: EditorOption
  pathMappings?: PathMapping[]

  /** Performance/feature mode (§17). Defaults to `"source"` for the first release. */
  mode?: InspectorMode

  ui?: {
    enabled?: boolean
    defaultOpen?: boolean
    theme?: OverlayTheme
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
    /** Add a compact `data-mi` attribute to element vnodes (§13). Off by default. */
    exposeDomAttributes?: boolean
  }

  mithrilImports?: string[]
  hyperscriptIdentifiers?: string[]

  debug?: boolean

  /** Attrs/state redaction policy (§15); defaults to {@link DEFAULT_REDACT_KEYS}. */
  redact?: { keys?: string[]; replacement?: string }
}

/** Default attrs/state key patterns redacted from component data views (§15). */
export const DEFAULT_REDACT_KEYS: readonly string[] = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apiKey",
  "accessToken",
  "refreshToken",
]

const DEFAULT_REDACT_REPLACEMENT = "[redacted]"
const DEFAULT_MITHRIL_IMPORTS = ["mithril"] as const
const DEFAULT_HYPERSCRIPT_IDENTIFIERS = ["m"] as const

export interface ResolvedUiOptions {
  readonly enabled: boolean
  readonly defaultOpen: boolean
  readonly theme: OverlayTheme
  readonly zIndex?: number
}

export interface ResolvedPickerOptions {
  readonly enabled: boolean
  readonly toggleShortcut: string
  readonly holdShortcut: string
  readonly openOnClick: boolean
  readonly continuous: boolean
}

export interface ResolvedComponentTreeOptions {
  readonly enabled: boolean
  readonly captureAttrs: boolean
  readonly captureState: boolean
}

export interface ResolvedSourceOptions {
  readonly elements: boolean
  readonly components: boolean
  readonly attributes: boolean
  readonly textExpressions: boolean
  readonly exposeDomAttributes: boolean
}

/** Fully-resolved options with every default applied (the plugin's internal shape). */
export interface ResolvedInspectorOptions {
  readonly enabled: boolean
  readonly includeInProduction: boolean
  readonly include?: FilterPattern
  readonly exclude?: FilterPattern
  readonly root?: string
  readonly projectRoots: readonly string[]
  readonly editor?: EditorOption
  readonly pathMappings: readonly PathMapping[]
  readonly mode: InspectorMode
  readonly debug: boolean
  readonly ui: ResolvedUiOptions
  readonly picker: ResolvedPickerOptions
  readonly componentTree: ResolvedComponentTreeOptions
  readonly source: ResolvedSourceOptions
  readonly mithrilImports: readonly string[]
  readonly hyperscriptIdentifiers: readonly string[]
  readonly redact: RedactionConfig
}

/** The serializable config injected into the runtime bootstrap module (§15). */
export interface RuntimeBootstrapConfig {
  readonly mode: InspectorMode
  readonly debug: boolean
  readonly exposeDomAttributes: boolean
  readonly redact: RedactionConfig
}

/**
 * Resolve the public options into the fully-defaulted internal shape. `env`
 * (default `process.env`) supplies `NODE_ENV` for the dev-only default (§2.1);
 * it is injectable so the resolution is deterministic in tests.
 */
export function resolveInspectorOptions(
  options: MithrilInspectorOptions = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
): ResolvedInspectorOptions {
  const ui = options.ui ?? {}
  const picker = options.picker ?? {}
  const componentTree = options.componentTree ?? {}
  const source = options.source ?? {}
  const redact = options.redact ?? {}
  const mode = options.mode ?? "source"

  return {
    enabled: options.enabled ?? env.NODE_ENV !== "production",
    includeInProduction: options.includeInProduction ?? false,
    ...(options.include !== undefined ? { include: options.include } : {}),
    ...(options.exclude !== undefined ? { exclude: options.exclude } : {}),
    ...(options.root !== undefined ? { root: options.root } : {}),
    projectRoots: options.projectRoots ?? [],
    ...(options.editor !== undefined ? { editor: options.editor } : {}),
    pathMappings: options.pathMappings ?? [],
    mode,
    debug: options.debug ?? false,
    ui: {
      enabled: ui.enabled ?? true,
      defaultOpen: ui.defaultOpen ?? false,
      theme: ui.theme ?? "system",
      ...(ui.zIndex !== undefined ? { zIndex: ui.zIndex } : {}),
    },
    picker: {
      enabled: picker.enabled ?? true,
      toggleShortcut: picker.toggleShortcut ?? "Alt+Shift+M",
      holdShortcut: picker.holdShortcut ?? "Alt",
      openOnClick: picker.openOnClick ?? false,
      continuous: picker.continuous ?? false,
    },
    componentTree: {
      enabled: componentTree.enabled ?? false,
      // §17 defines "full" mode itself as including attrs/state, so both
      // default to on once mode resolves to "full" — still overridable
      // explicitly (e.g. full mode's other diagnostics without attrs/state).
      captureAttrs: componentTree.captureAttrs ?? mode === "full",
      captureState: componentTree.captureState ?? mode === "full",
    },
    source: {
      elements: source.elements ?? true,
      components: source.components ?? true,
      attributes: source.attributes ?? false,
      textExpressions: source.textExpressions ?? false,
      exposeDomAttributes: source.exposeDomAttributes ?? false,
    },
    mithrilImports: options.mithrilImports ?? [...DEFAULT_MITHRIL_IMPORTS],
    hyperscriptIdentifiers: options.hyperscriptIdentifiers ?? [...DEFAULT_HYPERSCRIPT_IDENTIFIERS],
    redact: {
      keys: redact.keys ?? [...DEFAULT_REDACT_KEYS],
      replacement: redact.replacement ?? DEFAULT_REDACT_REPLACEMENT,
    },
  }
}

/** The runtime bootstrap config (§15: never carries component data, only policy). */
export function toRuntimeBootstrapConfig(resolved: ResolvedInspectorOptions): RuntimeBootstrapConfig {
  return {
    mode: resolved.mode,
    debug: resolved.debug,
    exposeDomAttributes: resolved.source.exposeDomAttributes,
    redact: resolved.redact,
  }
}

/** Map the `ui`/`picker`/`componentTree` blocks onto the overlay's own options input (§8, §11.1). */
export function toOverlayOptionsInput(resolved: ResolvedInspectorOptions): OverlayOptionsInput {
  return {
    enabled: resolved.ui.enabled,
    defaultOpen: resolved.ui.defaultOpen,
    theme: resolved.ui.theme,
    ...(resolved.ui.zIndex !== undefined ? { zIndex: resolved.ui.zIndex } : {}),
    picker: {
      enabled: resolved.picker.enabled,
      toggleShortcut: resolved.picker.toggleShortcut,
      holdShortcut: resolved.picker.holdShortcut,
      openOnClick: resolved.picker.openOnClick,
      continuous: resolved.picker.continuous,
    },
    componentTree: {
      enabled: resolved.componentTree.enabled,
      captureAttrs: resolved.componentTree.captureAttrs,
      captureState: resolved.componentTree.captureState,
    },
  }
}

/**
 * Build the open-in-editor server options (§10.2). The endpoint is bound to the
 * resolved project root — an explicit `root` option wins over the Vite root.
 */
export function toServerOptions(resolved: ResolvedInspectorOptions, viteRoot: string): InspectorServerOptions {
  return {
    root: resolved.root ?? viteRoot,
    projectRoots: [...resolved.projectRoots],
    ...(resolved.editor !== undefined ? { editor: resolved.editor } : {}),
    pathMappings: [...resolved.pathMappings],
  }
}

/**
 * Build the static part of the transform call (§11.2). The instrumented import
 * targets the plugin's virtual runtime module; `id`/`code` are supplied per file.
 */
export function toTransformOptions(
  resolved: ResolvedInspectorOptions,
  root: string,
): Omit<TransformOptions, "id" | "code"> {
  return {
    root,
    sourcemap: true,
    runtimeModule: RUNTIME_MODULE_ID,
    ...(resolved.include !== undefined ? { include: resolved.include } : {}),
    ...(resolved.exclude !== undefined ? { exclude: resolved.exclude } : {}),
    mithrilImports: [...resolved.mithrilImports],
    hyperscriptIdentifiers: [...resolved.hyperscriptIdentifiers],
  }
}
