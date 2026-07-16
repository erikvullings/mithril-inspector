import type { ModuleId, ModuleRecord, SourceLocation } from "@mithril-inspector/protocol"

/** Marker kinds, aligned with the protocol's `SourceLocation["kind"]` (§6.3). */
export type SourceKind = SourceLocation["kind"]

/**
 * One source record exactly as the transform's injected
 * `__miRegisterModule("m:…", { … })` call hands it to the runtime (§6.1,
 * ADR-106). This is the compact subset of {@link SourceLocation}: lines and
 * columns are 1-based, `endLine`/`endColumn` are optional.
 */
export interface SourceRecordInput {
  readonly line: number
  readonly column: number
  readonly endLine?: number
  readonly endColumn?: number
  readonly kind: SourceKind
  readonly displayName?: string
  readonly tagName?: string
}

/** The per-module payload of an injected `registerModule` call (§6.1). */
export interface ModuleRegistrationInput {
  readonly file: string
  readonly relativeFile: string
  readonly sources: Readonly<Record<string, SourceRecordInput>>
}

/**
 * The runtime source registry: the HMR-replaceable module/source table
 * (ADR-106). Keyed by a stable-per-file module id (`m:<string>`, §7.2), a
 * re-registration *replaces* a module's source table wholesale, so the registry
 * cannot grow across repeated edits and stale ids vanish.
 */
export interface SourceRegistry {
  /**
   * Install (or replace) a module's source table from the transform's compact
   * payload. Bumps and returns the module's generation.
   */
  registerModule(moduleId: ModuleId, registration: ModuleRegistrationInput): number
  /** Install (or replace) a module from a protocol {@link ModuleRecord} (the hook path). */
  setModule(record: ModuleRecord): number
  /**
   * Drop a module's sources without a replacement (the pre-HMR step, §11.2), but
   * keep a tombstone so the following re-registration bumps the generation. A
   * no-op for an unknown module.
   */
  invalidateModule(moduleId: ModuleId): void
  /** Resolve a qualified id (`m:<file>:s2`) to a full {@link SourceLocation}, or `null` (§16). */
  resolveSource(qualifiedId: string): SourceLocation | null
  /** Split a qualified id into module id + local source id (last-colon rule). */
  parseQualified(qualifiedId: string): { moduleId: ModuleId; sourceId: string } | null
  /** Count of modules with at least one live source. */
  moduleCount(): number
  /** Total live source records across all modules (bounded across edits). */
  sourceCount(): number
  /** The current registration generation for a module, or `undefined`. */
  generationOf(moduleId: ModuleId): number | undefined
  /** A fresh strong snapshot of every module's records (for `getSnapshot`). */
  modulesSnapshot(): Map<ModuleId, ModuleRecord>
}

interface ModuleEntry {
  readonly moduleId: ModuleId
  file: string
  relativeFile: string
  generation: number
  sources: Map<string, SourceLocation>
}

/**
 * Split a qualified id into module id + local id. The module id itself contains
 * a colon (`m:…`), so split on the *last* colon; the local id never does.
 * Returns `null` for anything malformed so callers can degrade to `null` (§16).
 */
function parseQualified(qualifiedId: string): { moduleId: ModuleId; sourceId: string } | null {
  const lastColon = qualifiedId.lastIndexOf(":")
  if (lastColon <= 0) return null
  const moduleId = qualifiedId.slice(0, lastColon)
  const sourceId = qualifiedId.slice(lastColon + 1)
  if (!moduleId.startsWith("m:") || moduleId.length <= 2 || sourceId.length === 0) return null
  return { moduleId: moduleId as ModuleId, sourceId }
}

export function createSourceRegistry(): SourceRegistry {
  const modules = new Map<ModuleId, ModuleEntry>()

  /** Expand the transform's compact record into a full protocol location. */
  const toLocation = (
    moduleId: ModuleId,
    sourceId: string,
    file: string,
    relativeFile: string,
    record: SourceRecordInput,
  ): SourceLocation => ({
    moduleId,
    sourceId,
    absoluteFile: file,
    relativeFile,
    line: record.line,
    column: record.column,
    kind: record.kind,
    ...(record.endLine !== undefined ? { endLine: record.endLine } : {}),
    ...(record.endColumn !== undefined ? { endColumn: record.endColumn } : {}),
    ...(record.displayName !== undefined ? { displayName: record.displayName } : {}),
    ...(record.tagName !== undefined ? { tagName: record.tagName } : {}),
  })

  const install = (
    moduleId: ModuleId,
    file: string,
    relativeFile: string,
    sources: Map<string, SourceLocation>,
  ): number => {
    const existing = modules.get(moduleId)
    const generation = existing === undefined ? 1 : existing.generation + 1
    // Wholesale replace: the previous table (and its stale ids) is dropped, so
    // the registry cannot grow across repeated edits (ADR-106).
    modules.set(moduleId, { moduleId, file, relativeFile, generation, sources })
    return generation
  }

  const registry: SourceRegistry = {
    registerModule(moduleId, registration) {
      const sources = new Map<string, SourceLocation>()
      for (const [sourceId, record] of Object.entries(registration.sources)) {
        sources.set(
          sourceId,
          toLocation(moduleId, sourceId, registration.file, registration.relativeFile, record),
        )
      }
      return install(moduleId, registration.file, registration.relativeFile, sources)
    },
    setModule(record) {
      const sources = new Map<string, SourceLocation>()
      for (const [sourceId, location] of Object.entries(record.sources)) {
        sources.set(sourceId, location)
      }
      return install(record.id, record.file, record.relativeFile, sources)
    },
    invalidateModule(moduleId) {
      const entry = modules.get(moduleId)
      if (entry === undefined) return
      // Keep the entry as a tombstone (generation, file) so a following
      // re-registration bumps rather than resets (ADR-106).
      entry.sources = new Map()
    },
    resolveSource(qualifiedId) {
      const parsed = parseQualified(qualifiedId)
      if (parsed === null) return null
      const entry = modules.get(parsed.moduleId)
      if (entry === undefined) return null
      return entry.sources.get(parsed.sourceId) ?? null
    },
    parseQualified,
    moduleCount() {
      let count = 0
      for (const entry of modules.values()) if (entry.sources.size > 0) count += 1
      return count
    },
    sourceCount() {
      let count = 0
      for (const entry of modules.values()) count += entry.sources.size
      return count
    },
    generationOf(moduleId) {
      return modules.get(moduleId)?.generation
    },
    modulesSnapshot() {
      const snapshot = new Map<ModuleId, ModuleRecord>()
      for (const entry of modules.values()) {
        const sources: Record<string, SourceLocation> = {}
        for (const [sourceId, location] of entry.sources) sources[sourceId] = location
        snapshot.set(entry.moduleId, {
          id: entry.moduleId,
          file: entry.file,
          relativeFile: entry.relativeFile,
          sources,
        })
      }
      return snapshot
    },
  }
  return registry
}
