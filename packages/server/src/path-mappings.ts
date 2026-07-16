/** A remote-environment path rewrite rule (§10.4: WSL, Docker, SSH, devcontainers, monorepos). */
export interface PathMapping {
  readonly from: string
  readonly to: string
}

/**
 * Rewrite a validated file path for the editor's filesystem view (§10.4).
 * Applied after root validation and before invoking the editor, so path
 * containment is always checked against the path this process can see, not
 * the (possibly foreign) path the editor will receive. Uses the first
 * mapping in array order whose `from` is a prefix of `filePath` on a path
 * separator boundary.
 */
export function applyPathMappings(filePath: string, mappings: readonly PathMapping[] = []): string {
  for (const mapping of mappings) {
    if (filePath === mapping.from) return mapping.to
    if (filePath.startsWith(`${mapping.from}/`) || filePath.startsWith(`${mapping.from}\\`)) {
      return mapping.to + filePath.slice(mapping.from.length)
    }
  }
  return filePath
}
