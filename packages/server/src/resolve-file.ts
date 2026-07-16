import { promises as fs } from "node:fs"
import path from "node:path"

export type FileResolutionErrorCode = "INVALID_PATH" | "FILE_OUTSIDE_ROOT" | "FILE_NOT_FOUND" | "IS_DIRECTORY"

export type FileResolutionResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly code: FileResolutionErrorCode; readonly message: string }

const NULL_BYTE = String.fromCharCode(0)

/** Whether `target` is `root` itself or a descendant of it, comparing resolved absolute paths. */
function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  if (relative === "") return true
  if (relative === "..") return false
  if (relative.startsWith(`..${path.sep}`)) return false
  if (path.isAbsolute(relative)) return false
  return true
}

const outsideRootResult: FileResolutionResult = {
  ok: false,
  code: "FILE_OUTSIDE_ROOT",
  message: "The requested file is outside the configured project root.",
}

/**
 * Resolve and validate a requested file against the configured project
 * roots (§10.2). Rejects traversal and absolute paths outside every root,
 * nonexistent files, symlinks whose real target escapes every root, and
 * directories. Returns the pre-symlink-resolution absolute path on success,
 * so the editor opens the path the caller asked for rather than its
 * (possibly less recognizable) symlink target.
 */
export async function resolveRequestedFile(
  file: string,
  root: string,
  projectRoots: readonly string[] = [],
): Promise<FileResolutionResult> {
  if (file.length === 0 || file.includes(NULL_BYTE)) {
    return { ok: false, code: "INVALID_PATH", message: "file must be a non-empty path without a null byte." }
  }

  const roots = [path.resolve(root), ...projectRoots.map((projectRoot) => path.resolve(projectRoot))]
  const candidate = path.isAbsolute(file) ? path.normalize(file) : path.resolve(root, file)

  if (!roots.some((candidateRoot) => isWithinRoot(candidateRoot, candidate))) {
    return outsideRootResult
  }

  let realPath: string
  try {
    realPath = await fs.realpath(candidate)
  } catch {
    return { ok: false, code: "FILE_NOT_FOUND", message: "The requested file does not exist." }
  }

  // Resolve the roots' own real paths too: on macOS, `os.tmpdir()` (and other
  // system paths) resolve through a symlink (`/var` -> `/private/var`), so
  // comparing a realpath'd candidate against textually-resolved roots would
  // reject legitimate files. Roots that don't exist keep their textual form.
  const realRoots = await Promise.all(
    roots.map((candidateRoot) => fs.realpath(candidateRoot).catch(() => candidateRoot)),
  )

  if (!realRoots.some((candidateRoot) => isWithinRoot(candidateRoot, realPath))) {
    return outsideRootResult
  }

  const stat = await fs.stat(realPath)
  if (stat.isDirectory()) {
    return { ok: false, code: "IS_DIRECTORY", message: "The requested path is a directory." }
  }
  if (!stat.isFile()) {
    return { ok: false, code: "FILE_NOT_FOUND", message: "The requested file does not exist." }
  }

  return { ok: true, path: candidate }
}
