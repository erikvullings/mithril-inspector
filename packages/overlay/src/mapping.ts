import type { SourceLocation } from "@mithril-inspector/protocol"

/**
 * Source-mapping precision the UI must distinguish (§2.4). The overlay shows an
 * *exact* badge only when it resolved the hovered element's own `m(...)`
 * expression; anything reached via the §2.4 fallback ladder (component view →
 * declaration → module) is *inferred*.
 */
export type MappingPrecision = "exact" | "inferred" | "none"

export interface MappingInfo {
  readonly precision: MappingPrecision
  /** Human-readable mapping tier, e.g. "Exact element source". */
  readonly label: string
  /** `relativeFile:line:column` (or a shorter form), or `null` when unknown. */
  readonly fileLine: string | null
  readonly location: SourceLocation | null
}

const NONE: MappingInfo = {
  precision: "none",
  label: "No source mapping",
  fileLine: null,
  location: null,
}

/**
 * The §2.4 ladder keyed by {@link SourceLocation.kind}. `element`,
 * `attribute` and `text-expression` are precise expression locations (exact);
 * `component-view`/`component-declaration` are inferred fallbacks.
 */
const KIND_TABLE: Record<SourceLocation["kind"], { precision: MappingPrecision; label: string }> = {
  element: { precision: "exact", label: "Exact element source" },
  attribute: { precision: "exact", label: "Attribute expression" },
  "text-expression": { precision: "exact", label: "Text expression" },
  "component-view": { precision: "inferred", label: "Component view" },
  "component-declaration": { precision: "inferred", label: "Component declaration" },
  unknown: { precision: "none", label: "Unknown source" },
}

/** Format a source location as `relativeFile:line:column`, trimming empty parts. */
export function formatFileLine(location: SourceLocation): string | null {
  const file = location.relativeFile || location.absoluteFile
  if (!file) return null
  if (!Number.isFinite(location.line) || location.line <= 0) return file
  if (!Number.isFinite(location.column) || location.column <= 0) {
    return `${file}:${location.line}`
  }
  return `${file}:${location.line}:${location.column}`
}

/**
 * Describe a resolved source location for display, classifying it on the §2.4
 * precision ladder. A `null` location (nothing resolved) degrades to "none".
 */
export function describeMapping(location: SourceLocation | null | undefined): MappingInfo {
  if (location === null || location === undefined) return NONE
  const entry = KIND_TABLE[location.kind] ?? KIND_TABLE.unknown
  const fileLine = formatFileLine(location)
  // A location that carries a file but no usable line still beats nothing: it's
  // the "module filename" tier of the ladder — inferred, not exact.
  const precision: MappingPrecision =
    entry.precision === "none" && fileLine !== null ? "inferred" : entry.precision
  const label = entry.precision === "none" && fileLine !== null ? "Module source" : entry.label
  return { precision, label, fileLine, location }
}
