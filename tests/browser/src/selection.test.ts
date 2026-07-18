import { join } from "node:path"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { HOST_ID } from "@mithril-inspector/overlay"

import { mi } from "./harness/browser.js"
import {
  activatePicker,
  shadowClick,
  shadowText,
  shadowTextAll,
  waitForShadowPresence,
} from "./harness/overlay.js"
import { createScenario, type Scenario } from "./harness/scenario.js"
import { positionOf } from "./harness/source-line.js"

/**
 * §19.2 assertion 4: click selects the correct source. Also assertion 6
 * (component ancestry): the full Layout -> ListScene chain, not just the
 * nearest owning component, is now available (task 0019).
 */
describe("click selects the correct source (§19.2 assertion 4)", () => {
  let scenario: Scenario

  beforeAll(async () => {
    scenario = await createScenario()
  }, 30_000)

  beforeEach(async () => {
    await scenario.reload()
    await activatePicker(scenario.page())
  })

  afterAll(async () => {
    await scenario.teardown()
  })

  it("clicking the greeting selects it and shows the correct component/source", async () => {
    const page = scenario.page()
    await page.hover("#greeting")
    await page.click("#greeting")

    await waitForShadowPresence(page, ".mi-breadcrumb", true)
    expect(await shadowText(page, ".mi-crumb-current")).toBe("Greeting")
    // The detail-meta line is tag+classes then source file:line (view.ts
    // `describeSelected`) — unlike the hover badge's `describeElement`, no id.
    const meta = await shadowTextAll(page, ".mi-detail-meta .mi-mono")
    expect(meta[0]).toBe("h1.greeting")

    const { line, column } = positionOf(join(scenario.fixture.root, "src", "Greeting.ts"), 'm("h1#greeting')
    expect(meta[1]).toBe(`src/Greeting.ts:${line}:${column}`)
  })

  it("selecting a list item resolves its nearest owning component (assertion 6)", async () => {
    const page = scenario.page()
    await page.hover("#item-apple")
    await page.click("#item-apple")

    await waitForShadowPresence(page, ".mi-breadcrumb", true)
    expect(await shadowText(page, ".mi-crumb-current")).toBe("ListScene")
  })

  it("reports the full multi-level ancestry chain, root-first (§19.2 assertion 6, task 0019)", async () => {
    const page = scenario.page()
    await page.hover("#item-apple")
    await page.click("#item-apple")
    await waitForShadowPresence(page, ".mi-crumb", true)

    const names = await shadowTextAll(page, ".mi-crumb")
    expect(names).toEqual(["Layout", "ListScene"])
  })

  it("clicking an ancestor highlights its own DOM range and surfaces its own 'Rendered element' action (§9.3, task 0019)", async () => {
    const page = scenario.page()
    await page.hover("#item-apple")
    await page.click("#item-apple")
    // openOnClick defaults to false now — a pick never auto-opens the editor,
    // so there's no earlier invocation to baseline past here.
    await waitForShadowPresence(page, ".mi-crumb", true)

    const layoutRect = await page.evaluate(() => {
      const box = document.getElementById("layout")!.getBoundingClientRect()
      return { left: `${box.left}px`, top: `${box.top}px` }
    })

    // Focus the outer ancestor (Layout, index 0 — root-first) rather than the
    // already-selected ListScene (index 1). The redraw this triggers is not
    // necessarily synchronous with the click, so wait on the resulting style
    // rather than reading it immediately.
    await shadowClick(page, ".mi-crumb", 0)
    await page.waitForFunction(
      (hostId, expectedLeft) => {
        const host = document.getElementById(hostId)
        const rect = host?.shadowRoot?.querySelector(".mi-rect-frozen") as HTMLElement | null
        return rect?.style.left === expectedLeft
      },
      { timeout: 5_000 },
      HOST_ID,
      layoutRect.left,
    )
    const frozenTop = await page.evaluate((hostId) => {
      const host = document.getElementById(hostId)
      const rect = host?.shadowRoot?.querySelector(".mi-rect-frozen") as HTMLElement | null
      return rect?.style.top ?? null
    }, HOST_ID)
    expect(frozenTop).toBe(layoutRect.top)

    // Focusing an ancestor other than the selected component (ListScene)
    // surfaces its own "Rendered element" toolbar action (§9.3, task 0019) —
    // "Open in editor" alone only ever covers the originally clicked node.
    await page.click(mi('.mi-toolbar [aria-label="Rendered element (Layout)"]'))
    const invocation = await scenario.editorStub.waitForInvocation(5_000)
    const { line, column } = positionOf(join(scenario.fixture.root, "src", "Layout.ts"), 'm("main#layout"')
    expect(invocation.file).toBe(join(scenario.fixture.root, "src", "Layout.ts"))
    expect(invocation.line).toBe(line)
    expect(invocation.column).toBe(column)
  })
})
