/**
 * Spike 0007 — HMR mapping survival (REQUIREMENTS.md §11.2 `handleHotUpdate`,
 * §20.1.11, Phase 0 spike 6).
 *
 * Models the runtime *source registry* and the invalidation / re-registration
 * protocol the Vite plugin's `handleHotUpdate` (task 0013) drives against it.
 * When Vite replaces a module the runtime must: invalidate the module's stale
 * source metadata, accept the replacement module's fresh source records, keep
 * the current UI selection alive when its identity is recoverable (else degrade
 * to a documented "stale" state), and never permanently corrupt the registry
 * (no unbounded growth, no crash).
 *
 * The registry is keyed by a *stable-per-file* module id (§7.2, `m:<string>`),
 * so re-registering a module *replaces* its source table rather than appending.
 */

/** Stable-per-file module id (§7.2). */
export type ModuleId = `m:${string}`

/** A per-module local source id, e.g. `"s2"` (§6.1). */
export type LocalSourceId = string

/** A fully-qualified source id, `"<moduleId>:<localSourceId>"` (§6.1). */
export type QualifiedSourceId = `${ModuleId}:${string}`

/** Source marker kinds (§6.3). */
export type SourceKind =
  | "component-declaration"
  | "component-view"
  | "element"
  | "attribute"
  | "text-expression"
  | "unknown"

/**
 * One source record as the transform registers it — a subset of the full
 * `SourceLocation` (§6.3). Lines and columns are 1-based.
 */
export interface SourceRecord {
  readonly line: number
  readonly column: number
  readonly kind: SourceKind
  readonly displayName?: string
  readonly tagName?: string
}

/**
 * The payload the transform's injected `registerModule("m:…", { … })` call
 * (§6.1) hands the runtime for one version of a module.
 */
export interface ModuleRegistration {
  readonly file: string
  readonly relativeFile: string
  readonly sources: Readonly<Record<LocalSourceId, SourceRecord>>
}

/** A resolved source location returned to the overlay when it hovers a node. */
export interface ResolvedSource {
  readonly moduleId: ModuleId
  readonly sourceId: LocalSourceId
  readonly qualifiedId: QualifiedSourceId
  readonly file: string
  readonly relativeFile: string
  readonly line: number
  readonly column: number
  readonly kind: SourceKind
  readonly displayName?: string
  readonly tagName?: string
  /** Which registration generation produced this location (bumps per edit). */
  readonly generation: number
}

/**
 * The stable identity the runtime captured when the selection was made. Line
 * numbers are deliberately *not* stored — only what survives an edit: the
 * qualified id and an identity "signature" (a named component's displayName, or
 * an element's kind+tag) used to re-locate the selection after re-registration.
 */
export interface SelectionRef {
  readonly qualifiedId: QualifiedSourceId
  readonly moduleId: ModuleId
  readonly sourceId: LocalSourceId
  readonly kind: SourceKind
  readonly signature: string
  readonly displayName?: string
  readonly tagName?: string
}

/** The live/stale/none state of the current selection, re-evaluated on read. */
export type Selection =
  | { readonly status: "none" }
  | {
      readonly status: "live"
      readonly ref: SelectionRef
      readonly location: ResolvedSource
      /** True when the id shifted and the selection was re-located by identity. */
      readonly recovered: boolean
    }
  | { readonly status: "stale"; readonly ref: SelectionRef; readonly reason: string }

export interface RuntimeRegistry {
  /**
   * Install (or replace) a module's source table. Re-registration with the same
   * module id drops every previous source for that module before inserting the
   * new ones — so repeated edits never grow the registry and stale ids vanish —
   * and bumps the module's generation. Returns the new generation.
   */
  registerModule(moduleId: ModuleId, registration: ModuleRegistration): number
  /**
   * Mark a module's sources stale (drop them) without a replacement. Called from
   * `handleHotUpdate` before the replacement module executes; also the terminal
   * state when a module/file is removed and never re-registers. A no-op for an
   * unknown module.
   */
  invalidateModule(moduleId: ModuleId): void
  /** Resolve a qualified source id, or `null` if unknown / invalidated (§16). */
  resolveSource(qualifiedId: QualifiedSourceId): ResolvedSource | null
  /** Stamp a vnode with a source id (the transform's `__miSource`, §6.2). */
  mark<T extends object>(qualifiedId: QualifiedSourceId, vnode: T): T
  /** Resolve the source of a stamped vnode (the hover path), or `null`. */
  sourceOf(vnode: object): ResolvedSource | null
  /**
   * Select a source by qualified id, capturing its identity for later recovery.
   * If the id cannot be resolved, the selection is left as `none`.
   */
  select(qualifiedId: QualifiedSourceId): Selection
  /** Drop the current selection. */
  clearSelection(): void
  /** The current selection, re-resolved against the live registry each call. */
  currentSelection(): Selection
  /** Count of modules with at least one live source. */
  moduleCount(): number
  /** Total live source records across all modules (bounded across edits). */
  sourceCount(): number
  /** The current registration generation for a module, or `undefined`. */
  generationOf(moduleId: ModuleId): number | undefined
}

interface ModuleEntry {
  readonly moduleId: ModuleId
  file: string
  relativeFile: string
  generation: number
  sources: Map<LocalSourceId, SourceRecord>
}

/**
 * The identity fingerprint used to re-locate a selection after its id shifts: a
 * named component is identified by its displayName; an unnamed element by its
 * kind and tag. Two indistinguishable siblings (same tag, no name) collapse to
 * the same signature — deliberately, so recovery can detect the ambiguity and
 * refuse to guess.
 */
function signatureOf(record: {
  readonly kind: SourceKind
  readonly displayName?: string
  readonly tagName?: string
}): string {
  if (record.displayName !== undefined && record.displayName.length > 0) {
    return `name:${record.displayName}`
  }
  if (record.tagName !== undefined && record.tagName.length > 0) {
    return `tag:${record.kind}:${record.tagName}`
  }
  return `kind:${record.kind}`
}

/**
 * Split a qualified id into module id + local id. The module id itself contains
 * a colon (`m:…`), so we split on the *last* colon; the local id never does.
 * Returns `null` for anything malformed, so callers can degrade to `null`.
 */
function parseQualified(
  qualifiedId: string,
): { moduleId: ModuleId; sourceId: LocalSourceId } | null {
  const lastColon = qualifiedId.lastIndexOf(":")
  if (lastColon <= 0) return null
  const moduleId = qualifiedId.slice(0, lastColon)
  const sourceId = qualifiedId.slice(lastColon + 1)
  if (!moduleId.startsWith("m:") || moduleId.length <= 2 || sourceId.length === 0) {
    return null
  }
  return { moduleId: moduleId as ModuleId, sourceId }
}

export function createRuntimeRegistry(): RuntimeRegistry {
  const modules = new Map<ModuleId, ModuleEntry>()
  // §6.2: vnode metadata is held in a WeakMap, never as an enumerable attr, so
  // the app can serialize attrs freely and stamped vnodes are collectable.
  const sourceByVnode = new WeakMap<object, QualifiedSourceId>()
  let selectionRef: SelectionRef | null = null

  const buildResolved = (
    entry: ModuleEntry,
    sourceId: LocalSourceId,
    record: SourceRecord,
  ): ResolvedSource => {
    const qualifiedId = `${entry.moduleId}:${sourceId}` as QualifiedSourceId
    return {
      moduleId: entry.moduleId,
      sourceId,
      qualifiedId,
      file: entry.file,
      relativeFile: entry.relativeFile,
      line: record.line,
      column: record.column,
      kind: record.kind,
      generation: entry.generation,
      ...(record.displayName !== undefined ? { displayName: record.displayName } : {}),
      ...(record.tagName !== undefined ? { tagName: record.tagName } : {}),
    }
  }

  const resolveSource = (qualifiedId: string): ResolvedSource | null => {
    const parsed = parseQualified(qualifiedId)
    if (parsed === null) return null
    const entry = modules.get(parsed.moduleId)
    if (entry === undefined) return null
    const record = entry.sources.get(parsed.sourceId)
    if (record === undefined) return null
    return buildResolved(entry, parsed.sourceId, record)
  }

  // Re-locate a selection whose id no longer resolves to its captured identity,
  // by finding the single source in the same module sharing its signature. Zero
  // or multiple matches -> null (ambiguous: refuse to guess).
  const recoverByIdentity = (ref: SelectionRef): ResolvedSource | null => {
    const entry = modules.get(ref.moduleId)
    if (entry === undefined) return null
    let match: ResolvedSource | null = null
    for (const [sourceId, record] of entry.sources) {
      if (signatureOf(record) !== ref.signature) continue
      if (match !== null) return null // ambiguous
      match = buildResolved(entry, sourceId, record)
    }
    return match
  }

  const currentSelection = (): Selection => {
    if (selectionRef === null) return { status: "none" }
    const ref = selectionRef

    // 1. The stable-id path: the same qualified id still denotes the same
    //    identity (an edit that only shifted line numbers). Keep it live.
    const direct = resolveSource(ref.qualifiedId)
    if (direct !== null && signatureOf(direct) === ref.signature) {
      return { status: "live", ref, location: direct, recovered: false }
    }

    // 2. The id shifted or vanished: try to re-locate by identity signature.
    const recovered = recoverByIdentity(ref)
    if (recovered !== null) {
      const recoveredRef: SelectionRef = {
        qualifiedId: recovered.qualifiedId,
        moduleId: recovered.moduleId,
        sourceId: recovered.sourceId,
        kind: recovered.kind,
        signature: ref.signature,
        ...(recovered.displayName !== undefined ? { displayName: recovered.displayName } : {}),
        ...(recovered.tagName !== undefined ? { tagName: recovered.tagName } : {}),
      }
      return { status: "live", ref: recoveredRef, location: recovered, recovered: true }
    }

    // 3. Unrecoverable: degrade to a documented stale state (§8.8, §16).
    const reason = modules.has(ref.moduleId)
      ? "the selected source no longer exists after the hot update"
      : "the selected source's module was removed"
    return { status: "stale", ref, reason }
  }

  return {
    registerModule(moduleId, registration) {
      const existing = modules.get(moduleId)
      const generation = existing === undefined ? 1 : existing.generation + 1
      const sources = new Map<LocalSourceId, SourceRecord>()
      for (const [sourceId, record] of Object.entries(registration.sources)) {
        sources.set(sourceId, record)
      }
      // Wholesale replace: the previous source table (and its stale ids) is
      // dropped, so the registry cannot grow across repeated edits.
      modules.set(moduleId, {
        moduleId,
        file: registration.file,
        relativeFile: registration.relativeFile,
        generation,
        sources,
      })
      return generation
    },
    invalidateModule(moduleId) {
      const entry = modules.get(moduleId)
      if (entry === undefined) return
      // Drop stale sources but keep the entry (its generation, file) as a
      // tombstone so a following re-registration bumps rather than resets.
      entry.sources = new Map()
    },
    resolveSource(qualifiedId) {
      return resolveSource(qualifiedId)
    },
    mark(qualifiedId, vnode) {
      sourceByVnode.set(vnode, qualifiedId)
      return vnode
    },
    sourceOf(vnode) {
      const qualifiedId = sourceByVnode.get(vnode)
      if (qualifiedId === undefined) return null
      return resolveSource(qualifiedId)
    },
    select(qualifiedId) {
      const resolved = resolveSource(qualifiedId)
      if (resolved === null) {
        return { status: "none" }
      }
      selectionRef = {
        qualifiedId: resolved.qualifiedId,
        moduleId: resolved.moduleId,
        sourceId: resolved.sourceId,
        kind: resolved.kind,
        signature: signatureOf(resolved),
        ...(resolved.displayName !== undefined ? { displayName: resolved.displayName } : {}),
        ...(resolved.tagName !== undefined ? { tagName: resolved.tagName } : {}),
      }
      return currentSelection()
    },
    clearSelection() {
      selectionRef = null
    },
    currentSelection() {
      return currentSelection()
    },
    moduleCount() {
      let count = 0
      for (const entry of modules.values()) {
        if (entry.sources.size > 0) count += 1
      }
      return count
    },
    sourceCount() {
      let count = 0
      for (const entry of modules.values()) {
        count += entry.sources.size
      }
      return count
    },
    generationOf(moduleId) {
      return modules.get(moduleId)?.generation
    },
  }
}
