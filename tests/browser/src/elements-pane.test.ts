import { join } from "node:path"

import type { Page } from "puppeteer"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { HOST_ID } from "@mithril-inspector/overlay"

import { mi } from "./harness/browser.js"
import { shadowClick, shadowTextAll, waitForShadowPresence } from "./harness/overlay.js"
import { createScenario, type Scenario } from "./harness/scenario.js"
import { positionOf } from "./harness/source-line.js"

/**
 * Elements tab (task 0031, REQUIREMENTS.md §9.1's optional "expansion of a
 * component into its owned vnode/element tree") against a real, non-jsdom
 * page — `UserList` (`fixtures/app/src/UserList.ts`) renders
 * `div.user-list-scene > [button#reorder-users-btn, ul#user-list > UserCard*]`,
 * so selecting it exercises both plain-element rows and the child-component
 * boundary link (each `<li class="user-card">` is a `UserCard` instance's own
 * `domRange.first`).
 */
describe("Elements tab (task 0031, §9.1 optional 'owned vnode/element tree' expansion)", () => {
  let scenario: Scenario

  beforeAll(async () => {
    scenario = await createScenario({ componentTree: { enabled: true } })
  }, 30_000)

  beforeEach(async () => {
    await scenario.reload()
  })

  afterAll(async () => {
    await scenario.teardown()
  })

  async function openComponentsTab(page: Page): Promise<void> {
    const toggle = await page.$(mi(".mi-toggle"))
    if (toggle !== null) await page.click(mi(".mi-toggle-btn:not(.mi-toggle-pick)"))
    await waitForShadowPresence(page, ".mi-tree-search", true)
  }

  it("renders the selected component's own DOM as mithril hyperscript labels, replacing nested UserCard children with link chips instead of their raw markup", async () => {
    const page = scenario.page()
    await openComponentsTab(page)

    const names = await shadowTextAll(page, ".mi-tree-name")
    const index = names.indexOf("UserList")
    expect(index).toBeGreaterThanOrEqual(0)
    await shadowClick(page, ".mi-tree-name", index)

    await page.click(mi('.mi-sidebar-btn[aria-label="Elements"]'))
    await waitForShadowPresence(page, ".mi-elements-tree", true)

    const rowLabels = await shadowTextAll(page, ".mi-elements-row")
    expect(rowLabels).toContain("div.user-list-scene")
    expect(rowLabels).toContain("button#reorder-users-btn")
    expect(rowLabels).toContain("ul#user-list")
    // The two UserCard children never appear as raw <li class="user-card"> rows.
    expect(rowLabels.some((label) => label.includes("user-card"))).toBe(false)

    const links = await shadowTextAll(page, ".mi-preview-component-link")
    expect(links.filter((label) => label === "UserCard")).toHaveLength(2)
  })

  it("clicking a nested component's link chip re-selects it, updating the Components tab's own selection (§9.3)", async () => {
    const page = scenario.page()
    await openComponentsTab(page)

    const names = await shadowTextAll(page, ".mi-tree-name")
    await shadowClick(page, ".mi-tree-name", names.indexOf("UserList"))
    await page.click(mi('.mi-sidebar-btn[aria-label="Elements"]'))
    await waitForShadowPresence(page, ".mi-preview-component-link", true)

    await shadowClick(page, ".mi-preview-component-link", 0)

    await page.click(mi('.mi-sidebar-btn[aria-label="Components"]'))
    await waitForShadowPresence(page, '[role="treeitem"][aria-selected="true"]', true)
    const selectedText = await page.evaluate((hostId) => {
      const host = document.getElementById(hostId)
      const row = host?.shadowRoot?.querySelector('[role="treeitem"][aria-selected="true"]')
      return row?.querySelector(".mi-tree-name")?.textContent ?? null
    }, HOST_ID)
    expect(selectedText).toContain("UserCard")
  })

  it("collapses a leaf element's own text onto its own row, with no nested list underneath (real, non-jsdom DOM)", async () => {
    // UserCard's own view is a single element with one text child
    // (`m(\`li.user-card#user-${id}\`, name)`) — exactly the "tag plus its
    // own text, nothing nested" case the inline-text rendering targets.
    const page = scenario.page()
    await openComponentsTab(page)

    const names = await shadowTextAll(page, ".mi-tree-name")
    const index = names.findIndex((name) => name === 'UserCard key="42"')
    expect(index).toBeGreaterThanOrEqual(0)
    await shadowClick(page, ".mi-tree-name", index)

    await page.click(mi('.mi-sidebar-btn[aria-label="Elements"]'))
    await waitForShadowPresence(page, ".mi-elements-row", true)

    expect(await shadowTextAll(page, ".mi-elements-row")).toEqual(["li#user-42.user-card"])
    expect(await shadowTextAll(page, ".mi-elements-text")).toEqual(["Ada"])
    // Only the root list itself — no nested <ul> under the leaf row, since it has no element/component children.
    const listCount = await page.evaluate((hostId) => {
      const host = document.getElementById(hostId)
      return host?.shadowRoot?.querySelectorAll(".mi-elements-tree").length ?? 0
    }, HOST_ID)
    expect(listCount).toBe(1)
  })

  it("clicking an element row jumps straight to its exact source (task 0031's own 'click to open source'), via the same stub-editor path as the toolbar's own 'Open in editor'", async () => {
    const page = scenario.page()
    await openComponentsTab(page)

    const names = await shadowTextAll(page, ".mi-tree-name")
    await shadowClick(page, ".mi-tree-name", names.indexOf("UserList"))
    await page.click(mi('.mi-sidebar-btn[aria-label="Elements"]'))
    await waitForShadowPresence(page, ".mi-elements-row", true)

    const rowLabels = await shadowTextAll(page, ".mi-elements-row")
    await shadowClick(page, ".mi-elements-row", rowLabels.indexOf("div.user-list-scene"))

    const invocation = await scenario.editorStub.waitForInvocation()
    const { line, column } = positionOf(join(scenario.fixture.root, "src", "UserList.ts"), 'm("div.user-list-scene"')

    expect(invocation.file).toBe(join(scenario.fixture.root, "src", "UserList.ts"))
    expect(invocation.line).toBe(line)
    expect(invocation.column).toBe(column)
  })

  it("keeps an element's own inline-appended text non-interactive — only its tag label (and a standalone text row) are clickable", async () => {
    // UserCard's own text ("Ada") is a child of its <li>, so it's folded into
    // that element's inlineText and rendered as a plain sibling <span> right
    // after the (separately clickable) tag-label <button> — verified
    // structurally (tag name) rather than by waiting on a real editor
    // invocation that should never come, which would just make a false
    // negative slow instead of fast.
    const page = scenario.page()
    await openComponentsTab(page)

    const names = await shadowTextAll(page, ".mi-tree-name")
    const index = names.findIndex((name) => name === 'UserCard key="42"')
    await shadowClick(page, ".mi-tree-name", index)
    await page.click(mi('.mi-sidebar-btn[aria-label="Elements"]'))
    await waitForShadowPresence(page, ".mi-elements-text", true)

    const tagNames = await page.evaluate((hostId) => {
      const host = document.getElementById(hostId)
      return Array.from(host?.shadowRoot?.querySelectorAll(".mi-elements-row, .mi-elements-text") ?? []).map(
        (el) => el.tagName,
      )
    }, HOST_ID)
    expect(tagNames).toEqual(["BUTTON", "SPAN"])
  })

  it("shows the empty-state message until a component is selected", async () => {
    const page = scenario.page()
    await openComponentsTab(page)
    await page.click(mi('.mi-sidebar-btn[aria-label="Elements"]'))
    await waitForShadowPresence(page, ".mi-detail-empty", true)
  })
})
