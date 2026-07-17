import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { Browser, Page } from "puppeteer"

import { launchBrowser, newPage } from "./harness/browser.js"
import { copyFixtureApp, type FixtureCopy } from "./harness/fixture-copy.js"
import { buildAndPreview, type ProductionPreview } from "./harness/production-build.js"

function collectOutput(dir: string): string {
  let combined = ""
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    combined += entry.isDirectory() ? collectOutput(full) : readFileSync(full, "utf8")
  }
  return combined
}

/**
 * §19.2 assertion 10: a production build contains no inspector runtime. A
 * real `vite build` + serving the output statically, then loading it in a
 * real browser — package-level coverage already exists
 * (packages/vite/src/build-exclusion.test.ts); this is the end-to-end,
 * in-a-real-page confirmation.
 */
describe("production build contains no inspector runtime (§19.2 assertion 10)", () => {
  let fixture: FixtureCopy
  let preview: ProductionPreview
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    fixture = copyFixtureApp()
    preview = await buildAndPreview(fixture.root)
    browser = await launchBrowser()
    page = await newPage(browser)
    await page.goto(preview.url, { waitUntil: "networkidle0" })
  }, 60_000)

  afterAll(async () => {
    await page.close()
    await browser.close()
    await preview.close()
    fixture.cleanup()
  })

  it("renders the app normally", async () => {
    const text = await page.$eval("#greeting", (el) => el.textContent)
    expect(text).toBe("Hello, Inspector")
  })

  it("never installs the runtime hook", async () => {
    const hookType = await page.evaluate(
      () => typeof (window as unknown as { __MITHRIL_INSPECTOR__?: unknown }).__MITHRIL_INSPECTOR__,
    )
    expect(hookType).toBe("undefined")
  })

  it("never mounts the overlay host", async () => {
    const hostExists = await page.evaluate(() => document.getElementById("__mithril-inspector-host") !== null)
    expect(hostExists).toBe(false)
  })

  it("contains no inspector markers anywhere in the built output", () => {
    const output = collectOutput(join(fixture.root, "dist"))
    expect(output).toContain("Hello, Inspector")
    expect(output).not.toContain("virtual:mithril-inspector")
    expect(output).not.toContain("__miRegisterModule")
    expect(output).not.toContain("__miSource")
    expect(output).not.toContain("__miComponent")
    expect(output).not.toContain("mountInspectorOverlay")
    expect(output).not.toContain("__mithril-inspector")
    expect(output).not.toContain("open-in-editor")
  })
})
