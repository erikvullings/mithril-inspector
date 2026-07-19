// Package metadata
export const packageName = "@mithril-inspector/protocol" as const
export const PROTOCOL_VERSION = 1 as const

// ============================================================================
// ID Types (§7.2)
// ============================================================================

export type ComponentId = `c:${number}`
export type VNodeId = `v:${number}`
export type ModuleId = `m:${string}`

export function makeComponentId(num: number): ComponentId {
  return `c:${num}` as const
}

export function makeVNodeId(num: number): VNodeId {
  return `v:${num}` as const
}

export function makeModuleId(id: string): ModuleId {
  return `m:${id}` as const
}

export function isComponentId(value: unknown): value is ComponentId {
  return typeof value === "string" && /^c:\d+$/.test(value)
}

export function isVNodeId(value: unknown): value is VNodeId {
  return typeof value === "string" && /^v:\d+$/.test(value)
}

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === "string" && value.startsWith("m:")
}

// ============================================================================
// Source Location (§6.3)
// ============================================================================

export interface SourceLocation {
  moduleId: string
  sourceId: string
  absoluteFile: string
  relativeFile: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
  kind:
    | "component-declaration"
    | "component-view"
    | "element"
    | "attribute"
    | "text-expression"
    | "unknown"
  displayName?: string
  tagName?: string
}

// ============================================================================
// Module Metadata
// ============================================================================

export interface ModuleRecord {
  id: ModuleId
  file: string
  relativeFile: string
  sources: Record<string, SourceLocation>
}

export interface ModuleInspectionMetadata {
  id: ModuleId
  file: string
  relativeFile: string
  sources: Record<string, SourceLocation>
}

// ============================================================================
// Component Records (§7.3)
// ============================================================================

export interface ComponentRecord {
  id: ComponentId
  parentId: ComponentId | null
  displayName: string
  /**
   * Whether `displayName` came from a heuristic fallback (filename-derived or
   * `"Anonymous"`, §9.2 tiers 6-7) rather than an explicit or declared name
   * (tiers 1-5). The UI must distinguish exact from inferred names (§2.4).
   */
  displayNameInferred: boolean
  source: SourceLocation | null
  kind: "object" | "closure" | "class" | "function" | "route-resolver" | "anonymous"
  /** The vnode's `key` attribute (§9.1 "UserCard key=\"42\""), or `null` when unkeyed. */
  key: string | number | null
  attrs: unknown
  state: unknown
  mounted: boolean
  createdAt: number
  updatedAt: number
  updateCount: number
  domRange: DomRange | null
  childIds: ComponentId[]
}

export interface ComponentPatch {
  id: ComponentId
  parentId?: ComponentId | null
  displayName?: string
  displayNameInferred?: boolean
  source?: SourceLocation | null
  kind?: ComponentRecord["kind"]
  key?: string | number | null
  attrs?: unknown
  state?: unknown
  mounted?: boolean
  updatedAt?: number
  updateCount?: number
  domRange?: DomRange | null
  childIds?: ComponentId[]
}

// ============================================================================
// VNode Records
// ============================================================================

export interface VNodeRecord {
  id: VNodeId
  componentId: ComponentId | null
  source: SourceLocation | null
  domRange: DomRange | null
}

// ============================================================================
// DOM Association (§7.6)
// ============================================================================

export interface DomRange {
  first: Node | null
  last: Node | null
}

export interface DomAssociation {
  vnodeId: VNodeId
  domRange: DomRange
  componentId: ComponentId | null
  source: SourceLocation | null
}

// ============================================================================
// Runtime Events (§9.4)
// ============================================================================

export type RuntimeEvent =
  | { type: "components-added"; records: ComponentRecord[] }
  | { type: "components-updated"; records: ComponentPatch[] }
  | { type: "components-removed"; ids: ComponentId[] }
  | { type: "dom-associated"; records: DomAssociation[] }
  | { type: "reset" }

export type InspectorListener = (event: RuntimeEvent) => void

// ============================================================================
// Inspector Snapshot
// ============================================================================

export interface InspectorSnapshot {
  components: Map<ComponentId, ComponentRecord>
  vnodes: Map<VNodeId, VNodeRecord>
  modules: Map<ModuleId, ModuleRecord>
  domAssociations: Map<Node, DomAssociation[]>
}

// ============================================================================
// Global Hook Interface (§7.1)
// ============================================================================

export interface MithrilInspectorHook {
  protocolVersion: typeof PROTOCOL_VERSION
  runtimeVersion: string
  registerModule(record: ModuleRecord): void
  registerComponent(record: ComponentRecord): ComponentId
  registerVNode(record: VNodeRecord): VNodeId
  associateDom(record: DomAssociation): void
  disposeVNode(vnodeId: VNodeId): void
  subscribe(listener: InspectorListener): () => void
  getSnapshot(): InspectorSnapshot
}

// ============================================================================
// Safe serializer preview tree (§7.4, §15, task 0020)
// ============================================================================

/**
 * One step from a preview tree's root value to a nested node. Used to request
 * lazy expansion — evaluating a deferred getter, paging a truncated
 * container, or expanding past a `max-depth` stub — without re-walking the
 * whole tree from scratch.
 */
export type PreviewPathSegment =
  | { readonly kind: "prop"; readonly key: string }
  | { readonly kind: "index"; readonly index: number }
  | { readonly kind: "map-key"; readonly index: number }
  | { readonly kind: "map-value"; readonly index: number }

export type PreviewPath = readonly PreviewPathSegment[]

export interface PreviewEntry {
  readonly key: string
  readonly node: PreviewNode
}

export interface PreviewMapEntry {
  readonly key: PreviewNode
  readonly value: PreviewNode
}

export type PreviewPrimitiveType = "string" | "number" | "boolean" | "null" | "undefined"

export interface PreviewPrimitiveNode {
  readonly kind: "primitive"
  readonly type: PreviewPrimitiveType
  readonly value: string | number | boolean | null
}

export interface PreviewBigIntNode {
  readonly kind: "bigint"
  readonly value: string
}

export interface PreviewSymbolNode {
  readonly kind: "symbol"
  readonly description: string | null
}

export interface PreviewFunctionNode {
  readonly kind: "function"
  readonly name: string
}

/**
 * A value the runtime recognizes as a Mithril component definition it
 * instrumented (object/closure/class/route-resolver) — e.g. a `PageDef.component`
 * field carried as plain data. Serialized as its resolved display name (§9.2's
 * same tiers used for the component tree) instead of an object dump of its
 * `view`/lifecycle-hook own properties, which are wrapper implementation
 * detail, not application data.
 */
export interface PreviewComponentNode {
  readonly kind: "component"
  readonly name: string
  /** True for a §9.2 fallback tier (filename-derived, "Anonymous") rather than an explicit or declared name. */
  readonly inferred: boolean
  /** The component's declaration location, if resolved — lets the UI open it in the editor directly, `null` when unresolvable. */
  readonly location: SourceLocation | null
}

export interface PreviewDomNodeNode {
  readonly kind: "dom-node"
  readonly nodeType: number
  readonly tagName: string | null
}

export interface PreviewErrorNode {
  readonly kind: "error"
  readonly name: string
  readonly message: string
}

export interface PreviewPromiseNode {
  readonly kind: "promise"
}

export interface PreviewArrayNode {
  readonly kind: "array"
  readonly length: number
  readonly items: PreviewNode[]
  readonly offset: number
  readonly truncated: boolean
  readonly path: PreviewPath
}

export interface PreviewObjectNode {
  readonly kind: "object"
  readonly className: string
  readonly size: number
  readonly entries: PreviewEntry[]
  readonly offset: number
  readonly truncated: boolean
  readonly path: PreviewPath
}

export interface PreviewMapNode {
  readonly kind: "map"
  readonly size: number
  readonly entries: PreviewMapEntry[]
  readonly offset: number
  readonly truncated: boolean
  readonly path: PreviewPath
}

export interface PreviewSetNode {
  readonly kind: "set"
  readonly size: number
  readonly items: PreviewNode[]
  readonly offset: number
  readonly truncated: boolean
  readonly path: PreviewPath
}

export interface PreviewTypedArrayNode {
  readonly kind: "typed-array"
  readonly typeName: string
  readonly length: number
  readonly items: PreviewNode[]
  readonly offset: number
  readonly truncated: boolean
  readonly path: PreviewPath
}

/**
 * An accessor property whose getter has not been invoked (§7.4: "getter
 * values evaluated only after explicit user action"). The UI shows a `(...)`
 * affordance and calls the runtime's `expand` with `path` to evaluate it.
 */
export interface PreviewGetterNode {
  readonly kind: "getter"
  readonly path: PreviewPath
}

/** A back-reference to an ancestor already on the current traversal path. */
export interface PreviewCircularNode {
  readonly kind: "circular"
  readonly path: PreviewPath
}

/** A value whose key matched a redaction pattern (§15); never inspected. */
export interface PreviewRedactedNode {
  readonly kind: "redacted"
  readonly replacement: string
}

/** A container past the initial max-depth budget; expand `path` to reveal it. */
export interface PreviewMaxDepthNode {
  readonly kind: "max-depth"
  readonly path: PreviewPath
}

export type PreviewNode =
  | PreviewPrimitiveNode
  | PreviewBigIntNode
  | PreviewSymbolNode
  | PreviewFunctionNode
  | PreviewComponentNode
  | PreviewDomNodeNode
  | PreviewErrorNode
  | PreviewPromiseNode
  | PreviewArrayNode
  | PreviewObjectNode
  | PreviewMapNode
  | PreviewSetNode
  | PreviewTypedArrayNode
  | PreviewGetterNode
  | PreviewCircularNode
  | PreviewRedactedNode
  | PreviewMaxDepthNode

// ============================================================================
// Editor Request/Response (§10.1)
// ============================================================================

export interface EditorRequest {
  file: string
  line: number
  column: number
}

export interface EditorResponse {
  ok: true
}

export interface EditorErrorResponse {
  ok: false
  error: {
    code: EditorErrorCode
    message: string
  }
}

export type EditorErrorCode =
  | "FILE_OUTSIDE_ROOT"
  | "FILE_NOT_FOUND"
  | "INVALID_PATH"
  | "INVALID_LINE_COLUMN"
  | "IS_DIRECTORY"
  | "EDITOR_NOT_AVAILABLE"
  | "EDITOR_LAUNCH_FAILED"

export function isEditorRequest(value: unknown): value is EditorRequest {
  if (typeof value !== "object" || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.file === "string" &&
    typeof obj.line === "number" &&
    typeof obj.column === "number" &&
    obj.line > 0 &&
    obj.column > 0
  )
}

export function isEditorResponse(value: unknown): value is EditorResponse | EditorErrorResponse {
  if (typeof value !== "object" || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.ok === "boolean"
}
