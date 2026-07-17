import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const EDITOR_STUB_SCRIPT = join(here, "..", "..", "fixtures", "editor-stub.mjs")

export interface EditorLocation {
  readonly file: string
  readonly line: number
  readonly column: number
}

/** Structurally a `CustomEditorOption` (`@mithril-inspector/server`) without importing that package directly. */
export interface StubEditorOption {
  readonly command: string
  readonly args: (location: EditorLocation) => string[]
}

export interface EditorStub {
  readonly editorOption: StubEditorOption
  /** Number of invocations recorded so far (sync) — a baseline for `waitForInvocation`'s `after`. */
  invocationCount(): number
  /**
   * Poll for the stub's recorded invocation (§10 "mock the launcher, assert
   * the request"); never a fixed sleep. When `after` is given, waits until
   * more than `after` invocations exist (so a second, later action's
   * invocation isn't mistaken for an earlier one already on disk) and
   * returns the newest.
   */
  waitForInvocation(timeoutMs?: number, after?: number): Promise<EditorLocation>
}

/**
 * A harmless stand-in "editor": spawns a tiny Node script that records its
 * `{file, line, column}` args to `resultFile` instead of opening anything
 * (task 0015 implementation note: "never spawn a real editor in CI").
 */
export function createEditorStub(tmpDir: string): EditorStub {
  const resultFile = join(tmpDir, "editor-invocations.jsonl")

  const lines = (): string[] => {
    if (!existsSync(resultFile)) return []
    const content = readFileSync(resultFile, "utf8").trim()
    return content.length === 0 ? [] : content.split("\n")
  }

  return {
    editorOption: {
      command: process.execPath,
      args: (location) => [
        EDITOR_STUB_SCRIPT,
        resultFile,
        location.file,
        String(location.line),
        String(location.column),
      ],
    },
    invocationCount() {
      return lines().length
    },
    async waitForInvocation(timeoutMs = 5_000, after = 0) {
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        const current = lines()
        if (current.length > after) return JSON.parse(current[current.length - 1]!) as EditorLocation
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error(`Editor stub recorded no invocation within ${timeoutMs}ms (${resultFile}).`)
    },
  }
}
