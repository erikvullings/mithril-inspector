import type {
  PreviewArrayNode,
  PreviewEntry,
  PreviewMapEntry,
  PreviewMapNode,
  PreviewNode,
  PreviewObjectNode,
  PreviewPath,
  PreviewPathSegment,
  PreviewSetNode,
  PreviewTypedArrayNode,
} from "@mithril-inspector/protocol"

/** §15 default redaction key patterns, matched case-insensitively as a substring of the property key. */
export const DEFAULT_REDACTION_KEYS: readonly string[] = [
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

const DEFAULT_REPLACEMENT = "[redacted]"

/** §7.4 lazy-inspection default limits, overridable per `createSerializer` call. */
export const DEFAULT_MAX_DEPTH = 2
export const DEFAULT_MAX_ENTRIES = 50

export interface SerializerOptions {
  /** Container nesting levels serialized eagerly before a `max-depth` stub (default {@link DEFAULT_MAX_DEPTH}). */
  readonly maxDepth?: number
  /** Entries/items serialized per container page before `truncated` (default {@link DEFAULT_MAX_ENTRIES}). */
  readonly maxEntries?: number
  /**
   * Additional case-insensitive key substrings to redact. Replaces the §15
   * built-in defaults when non-empty (matching the adapter-level `redact`
   * config's own replace semantics); an empty/omitted list falls back to
   * {@link DEFAULT_REDACTION_KEYS} so redaction is never silently off.
   */
  readonly redactKeys?: readonly string[]
  /** Replacement text shown in place of a redacted value (default `"[redacted]"`). */
  readonly replacement?: string
}

/** Attrs/state redaction serializer a component attaches via `setInspectorSerializer` (§14). */
export interface ComponentDataSerializer {
  readonly attrs?: (attrs: unknown) => unknown
  readonly state?: (state: unknown) => unknown
}

export interface ExpandOptions {
  /** Page start for a container's `entries`/`items` (default 0). */
  readonly offset?: number
}

export interface Serializer {
  /** Build the initial lazy preview tree for a value (§7.4). */
  serialize(value: unknown): PreviewNode
  /**
   * Re-derive `root`'s live value at `path` and serialize a fresh subtree
   * from there: evaluates a deferred getter (wrapped in try/catch, §7.4),
   * expands a `max-depth` stub, or pages a truncated container's next
   * `maxEntries` window via `options.offset`.
   */
  expand(root: unknown, path: PreviewPath, options?: ExpandOptions): PreviewNode
}

type PathResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly node: PreviewNode }

function toErrorNode(err: unknown): PreviewNode {
  if (err instanceof Error) return { kind: "error", name: err.name, message: err.message }
  return { kind: "error", name: "Error", message: String(err) }
}

function isDomNode(value: object): value is Node {
  return typeof Node !== "undefined" && value instanceof Node
}

function isTypedArray(value: object): value is ArrayBufferView & ArrayLike<number> {
  return ArrayBuffer.isView(value) && !(value instanceof DataView)
}

function classNameOf(obj: object): string {
  try {
    const proto = Object.getPrototypeOf(obj) as { constructor?: { name?: unknown } } | null
    const name = proto?.constructor?.name
    return typeof name === "string" && name.length > 0 ? name : "Object"
  } catch {
    return "Object"
  }
}

/** Builds a lazy, privacy-aware object/attrs/state serializer (§7.4, §15). */
export function createSerializer(options: SerializerOptions = {}): Serializer {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const configuredKeys = options.redactKeys ?? []
  const redactionKeys = configuredKeys.length > 0 ? configuredKeys : DEFAULT_REDACTION_KEYS
  const replacement = options.replacement ?? DEFAULT_REPLACEMENT

  const shouldRedact = (key: string): boolean => {
    const lower = key.toLowerCase()
    return redactionKeys.some((pattern) => lower.includes(pattern.toLowerCase()))
  }

  interface Page<T> {
    readonly items: readonly T[]
    readonly offset: number
    readonly truncated: boolean
  }

  const paginate = <T>(all: readonly T[], offset: number): Page<T> => {
    const start = Math.max(0, Math.min(offset, all.length))
    const items = all.slice(start, start + maxEntries)
    return { items, offset: start, truncated: start + items.length < all.length }
  }

  const buildEntryNode = (
    obj: object,
    key: string,
    path: PreviewPath,
    depth: number,
    seen: Map<object, PreviewPath>,
  ): PreviewNode => {
    const entryPath: PreviewPath = [...path, { kind: "prop", key }]
    if (shouldRedact(key)) return { kind: "redacted", replacement }
    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(obj, key)
    } catch (err) {
      return toErrorNode(err)
    }
    if (typeof descriptor?.get === "function") return { kind: "getter", path: entryPath }
    let raw: unknown
    try {
      raw = (obj as Record<string, unknown>)[key]
    } catch (err) {
      return toErrorNode(err)
    }
    return toNode(raw, entryPath, depth + 1, seen)
  }

  const toObjectNode = (
    obj: object,
    path: PreviewPath,
    depth: number,
    seen: Map<object, PreviewPath>,
    offset: number,
  ): PreviewObjectNode => {
    let keys: string[]
    try {
      keys = Object.keys(obj)
    } catch {
      keys = []
    }
    const page = paginate(keys, offset)
    const entries: PreviewEntry[] = page.items.map((key) => ({ key, node: buildEntryNode(obj, key, path, depth, seen) }))
    return {
      kind: "object",
      className: classNameOf(obj),
      size: keys.length,
      entries,
      offset: page.offset,
      truncated: page.truncated,
      path,
    }
  }

  const toArrayNode = (
    arr: readonly unknown[],
    path: PreviewPath,
    depth: number,
    seen: Map<object, PreviewPath>,
    offset: number,
  ): PreviewArrayNode => {
    const page = paginate(arr, offset)
    const items = page.items.map((item, i) =>
      toNode(item, [...path, { kind: "index", index: page.offset + i }], depth + 1, seen),
    )
    return { kind: "array", length: arr.length, items, offset: page.offset, truncated: page.truncated, path }
  }

  const toMapNode = (
    map: Map<unknown, unknown>,
    path: PreviewPath,
    depth: number,
    seen: Map<object, PreviewPath>,
    offset: number,
  ): PreviewMapNode => {
    const all = [...map.entries()]
    const page = paginate(all, offset)
    const entries: PreviewMapEntry[] = page.items.map(([k, v], i) => {
      const index = page.offset + i
      const keyNode = toNode(k, [...path, { kind: "map-key", index }], depth + 1, seen)
      // A string map key can match a redaction pattern (§15) exactly like an
      // object property; the key itself still displays, only the value is hidden.
      const valueNode: PreviewNode =
        typeof k === "string" && shouldRedact(k)
          ? { kind: "redacted", replacement }
          : toNode(v, [...path, { kind: "map-value", index }], depth + 1, seen)
      return { key: keyNode, value: valueNode }
    })
    return { kind: "map", size: map.size, entries, offset: page.offset, truncated: page.truncated, path }
  }

  const toSetNode = (
    set: Set<unknown>,
    path: PreviewPath,
    depth: number,
    seen: Map<object, PreviewPath>,
    offset: number,
  ): PreviewSetNode => {
    const all = [...set.values()]
    const page = paginate(all, offset)
    const items = page.items.map((item, i) =>
      toNode(item, [...path, { kind: "index", index: page.offset + i }], depth + 1, seen),
    )
    return { kind: "set", size: set.size, items, offset: page.offset, truncated: page.truncated, path }
  }

  const toTypedArrayNode = (
    view: ArrayBufferView & ArrayLike<number>,
    path: PreviewPath,
    offset: number,
  ): PreviewTypedArrayNode => {
    const all = Array.from(view)
    const page = paginate(all, offset)
    const items: PreviewNode[] = page.items.map((n) => ({ kind: "primitive", type: "number", value: n }))
    const typeName = (view as { constructor?: { name?: unknown } }).constructor?.name
    return {
      kind: "typed-array",
      typeName: typeof typeName === "string" && typeName.length > 0 ? typeName : "TypedArray",
      length: all.length,
      items,
      offset: page.offset,
      truncated: page.truncated,
      path,
    }
  }

  function toNode(value: unknown, path: PreviewPath, depth: number, seen: Map<object, PreviewPath>, offset = 0): PreviewNode {
    if (value === null) return { kind: "primitive", type: "null", value: null }
    const type = typeof value
    if (type === "string" || type === "number" || type === "boolean") {
      return { kind: "primitive", type, value: value as string | number | boolean }
    }
    if (type === "undefined") return { kind: "primitive", type: "undefined", value: null }
    if (type === "bigint") return { kind: "bigint", value: (value as bigint).toString() }
    if (type === "symbol") return { kind: "symbol", description: (value as symbol).description ?? null }
    if (type === "function") return { kind: "function", name: (value as { name?: string }).name || "" }

    // type === "object" from here.
    const obj = value as object
    const ancestorPath = seen.get(obj)
    if (ancestorPath !== undefined) return { kind: "circular", path: ancestorPath }

    if (isDomNode(obj)) {
      const tagName = obj.nodeType === 1 ? (obj as unknown as Element).tagName.toLowerCase() : null
      return { kind: "dom-node", nodeType: obj.nodeType, tagName }
    }
    if (obj instanceof Error) return { kind: "error", name: obj.name, message: obj.message }
    if (typeof Promise !== "undefined" && obj instanceof Promise) return { kind: "promise" }

    if (depth >= maxDepth) return { kind: "max-depth", path }

    seen.set(obj, path)
    try {
      if (Array.isArray(obj)) return toArrayNode(obj, path, depth, seen, offset)
      if (obj instanceof Map) return toMapNode(obj, path, depth, seen, offset)
      if (obj instanceof Set) return toSetNode(obj, path, depth, seen, offset)
      if (isTypedArray(obj)) return toTypedArrayNode(obj, path, offset)
      return toObjectNode(obj, path, depth, seen, offset)
    } finally {
      seen.delete(obj)
    }
  }

  const readSegment = (value: unknown, segment: PreviewPathSegment): PathResult => {
    try {
      switch (segment.kind) {
        case "prop": {
          const { key } = segment
          if (value === null || (typeof value !== "object" && typeof value !== "function")) {
            return { ok: true, value: undefined }
          }
          if (shouldRedact(key)) return { ok: false, node: { kind: "redacted", replacement } }
          const descriptor = Object.getOwnPropertyDescriptor(value, key)
          if (typeof descriptor?.get === "function") return { ok: true, value: descriptor.get.call(value) }
          return { ok: true, value: (value as Record<string, unknown>)[key] }
        }
        case "index": {
          if (value instanceof Set) return { ok: true, value: [...value.values()][segment.index] }
          return { ok: true, value: (value as ArrayLike<unknown>)[segment.index] }
        }
        case "map-key": {
          const entry = [...(value as Map<unknown, unknown>).entries()][segment.index]
          return { ok: true, value: entry?.[0] }
        }
        case "map-value": {
          const entry = [...(value as Map<unknown, unknown>).entries()][segment.index]
          const key = entry?.[0]
          if (typeof key === "string" && shouldRedact(key)) return { ok: false, node: { kind: "redacted", replacement } }
          return { ok: true, value: entry?.[1] }
        }
      }
    } catch (err) {
      return { ok: false, node: toErrorNode(err) }
    }
  }

  const resolveAlongPath = (root: unknown, path: PreviewPath): PathResult => {
    let current = root
    for (const segment of path) {
      const result = readSegment(current, segment)
      if (!result.ok) return result
      current = result.value
    }
    return { ok: true, value: current }
  }

  return {
    serialize(value: unknown): PreviewNode {
      return toNode(value, [], 0, new Map())
    },
    expand(root: unknown, path: PreviewPath, expandOptions: ExpandOptions = {}): PreviewNode {
      const resolved = resolveAlongPath(root, path)
      if (!resolved.ok) return resolved.node
      return toNode(resolved.value, path, 0, new Map(), expandOptions.offset ?? 0)
    },
  }
}
