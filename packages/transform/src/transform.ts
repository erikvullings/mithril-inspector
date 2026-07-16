import { parse } from "@babel/parser"
import type { ParserPlugin } from "@babel/parser"
import type { ModuleInspectionMetadata, SourceLocation } from "@mithril-inspector/protocol"
import { makeModuleId } from "@mithril-inspector/protocol"
import MagicString from "magic-string"

import { createFilter } from "@rollup/pluginutils"

import { findMithrilBindings } from "./bindings.js"
import { planMarkers } from "./instrument.js"
import type { ModuleRegistration, SourceRecord, TransformOptions, TransformResult } from "./types.js"

const DEFAULT_RUNTIME_MODULE = "@mithril-inspector/runtime"
const DEFAULT_MITHRIL_IMPORTS = ["mithril"] as const
const DEFAULT_HYPERSCRIPT_IDENTIFIERS = ["m"] as const

/** FNV-1a hash, base-36 — deterministic, dependency-free module ids. */
const fnv1a = (input: string, seed: number): number => {
  let hash = seed >>> 0
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** Stable-per-file module hash (ADR-106: derived from the resolved path). */
const moduleHash = (relativeFile: string): string =>
  `${fnv1a(relativeFile, 0x811c9dc5).toString(36)}${fnv1a(relativeFile, 0x9e3779b9).toString(36)}`

/** Normalizes a bundler id to a plain file path (forward slashes, no query). */
const cleanId = (id: string): string => id.replace(/\\/g, "/").split("?", 1)[0]!

/**
 * Parser plugins by extension: TS syntax for `.ts`/`.tsx`, JSX for `.tsx`,
 * `.jsx` and plain JS (§6.6 — JSX support is experimental and assumes
 * Mithril's hyperscript factory).
 */
const parserPlugins = (file: string): ParserPlugin[] => {
  if (file.endsWith(".tsx")) return ["typescript", "jsx"]
  if (/\.(ts|mts|cts)$/.test(file)) return ["typescript"]
  return ["jsx"]
}

const SCRIPT_EXTENSIONS = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/

/** Virtual modules, declaration files and non-script files are never touched. */
const isTransformableFile = (id: string, file: string): boolean =>
  !id.startsWith("\0") && !/\.d\.(ts|mts|cts)$/.test(file) && SCRIPT_EXTENSIONS.test(file)

const relativeTo = (file: string, root: string | undefined): string => {
  if (root === undefined) return file
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/+$/, "")
  return file.startsWith(`${normalizedRoot}/`) ? file.slice(normalizedRoot.length + 1) : file
}

/**
 * Transform cache keyed by file content and every output-relevant option
 * (§17). Bounded LRU so long dev sessions with many edits stay flat.
 */
const cache = new Map<string, TransformResult | null>()
const MAX_CACHE_ENTRIES = 512

export function clearTransformCache(): void {
  cache.clear()
}

const cacheKey = (
  file: string,
  code: string,
  parts: ReadonlyArray<string | boolean | readonly string[] | undefined>,
): string =>
  `${JSON.stringify(parts)}|${file}|${code.length}:${fnv1a(code, 0x811c9dc5).toString(36)}${fnv1a(code, 0x9e3779b9).toString(36)}`

/**
 * Bundler-neutral source instrumentation for Mithril modules (§4, §6).
 * Returns `null` for files without confirmed Mithril usage so the bundler
 * keeps the original module and source map untouched.
 */
export function transformMithrilModule(options: TransformOptions): TransformResult | null {
  const {
    id,
    code,
    root,
    sourcemap = true,
    runtimeModule = DEFAULT_RUNTIME_MODULE,
    mithrilImports = DEFAULT_MITHRIL_IMPORTS,
    hyperscriptIdentifiers = DEFAULT_HYPERSCRIPT_IDENTIFIERS,
  } = options

  const file = cleanId(id)
  if (!isTransformableFile(id, file)) return null
  if (options.include !== undefined || options.exclude !== undefined) {
    const filter = createFilter(options.include, options.exclude, { resolve: false })
    if (!filter(file)) return null
  }
  const relativeFile = relativeTo(file, root)

  const key = cacheKey(file, code, [
    relativeFile,
    sourcemap,
    runtimeModule,
    mithrilImports,
    hyperscriptIdentifiers,
  ])
  const cached = cache.get(key)
  if (cached !== undefined || cache.has(key)) {
    cache.delete(key)
    cache.set(key, cached ?? null)
    return cached ?? null
  }

  const result = instrumentModule(file, relativeFile, code, {
    sourcemap,
    runtimeModule,
    mithrilImports,
    hyperscriptIdentifiers,
  })
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(key, result)
  return result
}

interface ResolvedOptions {
  sourcemap: boolean
  runtimeModule: string
  mithrilImports: readonly string[]
  hyperscriptIdentifiers: readonly string[]
}

function instrumentModule(
  file: string,
  relativeFile: string,
  code: string,
  { sourcemap, runtimeModule, mithrilImports, hyperscriptIdentifiers }: ResolvedOptions,
): TransformResult | null {
  // A file the parser rejects is left to the bundler to report (§2.4, §16).
  let ast: ReturnType<typeof parse>
  try {
    ast = parse(code, { sourceType: "module", plugins: parserPlugins(file) })
  } catch {
    return null
  }

  const bindings = findMithrilBindings(ast.program, mithrilImports, hyperscriptIdentifiers)
  if (bindings.size === 0) return null

  const markers = planMarkers(ast.program, code, bindings)
  if (markers.length === 0) return null

  const moduleId = makeModuleId(moduleHash(relativeFile))
  const ms = new MagicString(code)

  const sources: Record<string, SourceRecord> = {}
  const metadataSources: Record<string, SourceLocation> = {}
  markers.forEach((marker, index) => {
    const sourceId = `s${index + 1}`
    const shared = {
      line: marker.line,
      column: marker.column,
      endLine: marker.endLine,
      endColumn: marker.endColumn,
      kind: marker.kind,
      ...(marker.displayName === undefined ? {} : { displayName: marker.displayName }),
      ...(marker.tagName === undefined ? {} : { tagName: marker.tagName }),
    }
    sources[sourceId] = shared
    metadataSources[sourceId] = {
      moduleId,
      sourceId,
      absoluteFile: file,
      relativeFile,
      ...shared,
    }
    const qualifiedId = JSON.stringify(`${moduleId}:${sourceId}`)
    if (marker.edit?.type === "wrap") {
      ms.appendLeft(marker.edit.start, `${marker.edit.helper}(${qualifiedId}, `)
      ms.appendRight(marker.edit.end, ")")
    } else if (marker.edit?.type === "insert-after") {
      ms.appendRight(marker.edit.at, `\n__miComponent(${qualifiedId}, ${marker.edit.reference});`)
    }
  })

  const registration: ModuleRegistration = { file, relativeFile, sources }
  ms.prepend(
    `import { registerModule as __miRegisterModule, source as __miSource, component as __miComponent } from ${JSON.stringify(runtimeModule)};\n` +
      `__miRegisterModule(${JSON.stringify(moduleId)}, ${JSON.stringify(registration)});\n`,
  )

  const metadata: ModuleInspectionMetadata = {
    id: moduleId,
    file,
    relativeFile,
    sources: metadataSources,
  }

  return {
    code: ms.toString(),
    ...(sourcemap
      ? { map: ms.generateMap({ source: file, hires: true, includeContent: true }) }
      : {}),
    metadata,
  }
}
