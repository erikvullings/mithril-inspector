import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { activatePicker, shadowText, waitForShadowText } from "./harness/overlay.js"
import { createScenario, type Scenario } from "./harness/scenario.js"
import { positionOf } from "./harness/source-line.js"

/**
 * §19.2 "HMR" fixture scenario: Mithril has no HMR-integration plugin, so
 * editing a component file falls back to Vite's default full-reload
 * propagation (nothing in the import chain calls `import.meta.hot.accept()`)
 * — that reload is the real HMR event this app produces. The test proves the
 * inspector's module registration/source mapping is accurate immediately
 * after it (ADR-106 invalidate-then-re-register), not left stale.
 */
describe("HMR updates content via Vite's reload and mappings stay accurate (§19.2 HMR)", () => {
  let scenario: Scenario
  let loadCount: number

  beforeAll(async () => {
    scenario = await createScenario()
    loadCount = 0
    scenario.page().on("load", () => {
      loadCount += 1
    })
  }, 30_000)

  afterAll(async () => {
    await scenario.teardown()
  })

  it("reloads with the edited content and keeps the source mapping accurate", async () => {
    const page = scenario.page()
    const hmrFile = join(scenario.fixture.root, "src", "Hmr.ts")

    const before = await page.$eval("#hmr-text", (el) => el.textContent)
    expect(before).toBe("HMR original text")

    const original = readFileSync(hmrFile, "utf8")
    const updated = original.replace("HMR original text", "HMR updated text")
    expect(updated).not.toBe(original)
    writeFileSync(hmrFile, updated)

    await page.waitForNavigation({ waitUntil: "networkidle0" })
    await page.waitForFunction(() => document.querySelector("#hmr-text")?.textContent === "HMR updated text")

    expect(loadCount).toBe(1)

    await activatePicker(page)
    await page.hover("#hmr-text")
    await waitForShadowText(page, ".mi-hb-element", "hmr-text")
    expect(await shadowText(page, ".mi-hb-component")).toBe("HmrScene")

    const { line, column } = positionOf(hmrFile, 'm("p#hmr-text"')
    expect(await shadowText(page, ".mi-hb-source")).toBe(`src/Hmr.ts:${line}:${column}`)
  })
})
