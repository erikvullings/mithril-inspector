import { cpSync, mkdtempSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE_SOURCE = join(here, "..", "..", "fixtures", "app")
// Copies land as siblings of tests/browser/node_modules (not under /tmp) so
// Vite/Node resolve `mithril` and `@mithril-inspector/vite` from the workspace
// store while walking up from the fixture root, mirroring
// packages/vite/src/build-exclusion.test.ts.
const TMP_PREFIX = join(here, "..", "..", ".browser-fixture-")

export interface FixtureCopy {
  readonly root: string
  cleanup(): void
}

/** A fresh, disposable copy of the fixture app — safe for tests that edit files on disk (HMR) or mutate state. */
export function copyFixtureApp(): FixtureCopy {
  const root = mkdtempSync(TMP_PREFIX)
  cpSync(FIXTURE_SOURCE, root, { recursive: true })
  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}
