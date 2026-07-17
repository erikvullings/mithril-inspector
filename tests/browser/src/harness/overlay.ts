import type { Page } from "puppeteer"

import { HOST_ID } from "@mithril-inspector/overlay"

import { mi } from "./browser.js"

/**
 * Expand the panel (if collapsed) and toggle picking on, waiting for the
 * picking banner (§8.4). Safe to call when the panel is already expanded
 * (e.g. a second activation within the same test).
 */
export async function activatePicker(page: Page): Promise<void> {
  const collapsedTab = await page.$(mi(".mi-tab"))
  if (collapsedTab !== null) await collapsedTab.click()
  await page.waitForSelector(mi("button[aria-pressed]"), { visible: true })
  await page.click(mi("button[aria-pressed]"))
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

/** The `.mi-val` of the details row whose `.mi-key` is exactly `key` (the "Selected" panel), or `null`. */
export function shadowDetailRow(page: Page, key: string): Promise<string | null> {
  return page.evaluate(
    (hostId, expectedKey) => {
      const host = document.getElementById(hostId)
      const rows = host?.shadowRoot?.querySelectorAll(".mi-row") ?? []
      for (const row of Array.from(rows)) {
        const keyText = row.querySelector(".mi-key")?.textContent?.trim()
        if (keyText === expectedKey) return row.querySelector(".mi-val")?.textContent?.trim() ?? null
      }
      return null
    },
    HOST_ID,
    key,
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
