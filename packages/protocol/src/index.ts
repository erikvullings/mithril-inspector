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
