import type { Browser, Page } from "puppeteer"

import type { MithrilInspectorOptions } from "@mithril-inspector/vite"

import { launchBrowser, newPage } from "./browser.js"
import { startDevServer, type DevServerHandle } from "./dev-server.js"
import { createEditorStub, type EditorStub } from "./editor-stub.js"
import { copyFixtureApp, type FixtureCopy } from "./fixture-copy.js"

export interface Scenario {
  readonly url: string
  readonly fixture: FixtureCopy
  readonly editorStub: EditorStub
  readonly server: DevServerHandle
  readonly browser: Browser
  page(): Page
  /** Fresh navigation to the app root — isolates each `it()` without paying for a new server/browser. */
  reload(): Promise<void>
  teardown(): Promise<void>
}

/**
 * One dev server + one browser shared by every test in a file; `reload()`
 * isolates individual tests cheaply. The editor is always the harmless stub
 * (never a real editor, task 0015 implementation note) regardless of what the
 * caller passes.
 */
export async function createScenario(options: MithrilInspectorOptions = {}): Promise<Scenario> {
  const fixture = copyFixtureApp()
  const editorStub = createEditorStub(fixture.root)
  const server = await startDevServer(fixture.root, { ...options, editor: editorStub.editorOption })
  const browser = await launchBrowser()
  const page = await newPage(browser)
  await page.goto(server.url, { waitUntil: "networkidle0" })

  return {
    url: server.url,
    fixture,
    editorStub,
    server,
    browser,
    page: () => page,
    async reload() {
      // The overlay persists collapsed/offset state to localStorage (§8.1), which
      // survives a same-origin navigation — clear it so every test starts from
      // the same collapsed, default-position overlay.
      await page.evaluate(() => localStorage.clear())
      await page.goto(server.url, { waitUntil: "networkidle0" })
    },
    async teardown() {
      await page.close().catch(() => {})
      await browser.close()
      await server.close()
      fixture.cleanup()
    },
  }
}
