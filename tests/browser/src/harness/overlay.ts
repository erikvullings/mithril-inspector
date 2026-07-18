import type { Page } from "puppeteer"

import { HOST_ID } from "@mithril-inspector/overlay"

import { mi } from "./browser.js"

/**
 * Expand the panel (if collapsed) and toggle picking on, waiting for the
 * picking banner (§8.4). Safe to call when the panel is already expanded
 * (e.g. a second activation within the same test).
 */
export async function activatePicker(page: Page): Promise<void> {
  const toggle = await page.$(mi(".mi-toggle"))
  if (toggle !== null) {
    // Expand via the "M" mark, not `.mi-picker-btn` — that one picks
    // directly from the collapsed state without expanding the panel.
    await page.click(mi(".mi-toggle-btn:not(.mi-toggle-pick)"))
    await page.waitForSelector(mi(".mi-dock"), { visible: true })
  }
  await page.waitForSelector(mi(".mi-picker-btn"), { visible: true })
  await page.click(mi(".mi-picker-btn"))
  await page.waitForFunction(
    (hostId) => {
      const host = document.getElementById(hostId)
      return host?.shadowRoot?.querySelector(".mi-picking-banner") != null
    },
    {},
    HOST_ID,
  )
}

/** Cancel picking via Escape (§8.4) — the only way to exit picking without a click, which the picker would otherwise intercept. */
export async function cancelPicker(page: Page): Promise<void> {
  await page.keyboard.press("Escape")
  await page.waitForFunction(
    (hostId) => {
      const host = document.getElementById(hostId)
      return host?.shadowRoot?.querySelector(".mi-picking-banner") == null
    },
    {},
    HOST_ID,
  )
}

/** `textContent` of an element inside the overlay's shadow root, or `null`. */
export function shadowText(page: Page, selector: string): Promise<string | null> {
  return page.evaluate(
    (hostId, sel) => {
      const host = document.getElementById(hostId)
      const el = host?.shadowRoot?.querySelector(sel)
      return el === null || el === undefined ? null : el.textContent
    },
    HOST_ID,
    selector,
  )
}

/** Waits until a shadow-root element's `textContent` contains `expected` (no fixed sleeps). */
export function waitForShadowText(page: Page, selector: string, expected: string, timeout = 5_000): Promise<unknown> {
  return page.waitForFunction(
    (hostId, sel, needle) => {
      const host = document.getElementById(hostId)
      const el = host?.shadowRoot?.querySelector(sel)
      return (el?.textContent ?? "").includes(needle)
    },
    { timeout },
    HOST_ID,
    selector,
    expected,
  )
}

/** Whether a selector currently matches an element inside the overlay's shadow root. */
export function shadowExists(page: Page, selector: string): Promise<boolean> {
  return page.evaluate(
    (hostId, sel) => {
      const host = document.getElementById(hostId)
      return (host?.shadowRoot?.querySelector(sel) ?? null) !== null
    },
    HOST_ID,
    selector,
  )
}

/** Trimmed `textContent` of every shadow-root element matching `selector`, in DOM order. */
export function shadowTextAll(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(
    (hostId, sel) => {
      const host = document.getElementById(hostId)
      return Array.from(host?.shadowRoot?.querySelectorAll(sel) ?? []).map((el) => el.textContent?.trim() ?? "")
    },
    HOST_ID,
    selector,
  )
}

/** Clicks the `index`-th shadow-root element matching `selector` (no native click target to hover/position). */
export function shadowClick(page: Page, selector: string, index = 0): Promise<void> {
  return page.evaluate(
    (hostId, sel, i) => {
      const host = document.getElementById(hostId)
      const el = host?.shadowRoot?.querySelectorAll(sel)[i] as HTMLElement | undefined
      el?.click()
    },
    HOST_ID,
    selector,
    index,
  )
}

/** Waits until a selector matches (or stops matching, with `present: false`) inside the shadow root. */
export function waitForShadowPresence(
  page: Page,
  selector: string,
  present: boolean,
  timeout = 5_000,
): Promise<unknown> {
  return page.waitForFunction(
    (hostId, sel, expectPresent) => {
      const host = document.getElementById(hostId)
      const found = (host?.shadowRoot?.querySelector(sel) ?? null) !== null
      return found === expectPresent
    },
    { timeout },
    HOST_ID,
    selector,
    present,
  )
}
