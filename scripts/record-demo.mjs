#!/usr/bin/env node
// Records docs/media/inspector-demo.gif against the real playground app
// (apps/playground-vite): a real Vite dev server plus a real headless
// Chromium tab, driven with Puppeteer — no hand-editing of frames. Puppeteer
// 25's `page.screencast({ format: "gif" })` pipes the CDP screencast straight
// through ffmpeg (palette-generated, so no separate encoding pass here); see
// https://pptr.dev and node_modules/puppeteer-core/.../node/ScreenRecorder.js
// for what it does under the hood.
//
// Prerequisite: `pnpm build` (this drives the already-built
// @mithril-inspector/vite plugin via apps/playground-vite/vite.config.ts,
// same as any other consumer — see the root README's "Testing a package
// locally" section).
//
// Usage:
//   node scripts/record-demo.mjs [--out <path>] [--headful] [--port <n>]

import { createServer as createViteServer } from "vite"
import puppeteer from "puppeteer"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PLAYGROUND_DIR = path.join(ROOT, "apps/playground-vite")

// packages/overlay/src/overlay.ts — the shadow-host id the overlay mounts
// into. Hardcoded rather than imported so this script only needs `vite` and
// `puppeteer` as root devDependencies, not every workspace package it drives.
const HOST_ID = "__mithril-inspector-host"

const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1 }

function parseArgs(argv) {
  const args = { out: path.join(ROOT, "docs/media/inspector-demo.gif"), headful: false, port: 5199 }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") args.out = path.resolve(argv[++i])
    else if (argv[i] === "--headful") args.headful = true
    else if (argv[i] === "--port") args.port = Number(argv[++i])
  }
  return args
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Every overlay-side selector goes through Puppeteer's shadow-piercing `pierce/` query handler — the overlay mounts into an open shadow root. */
const mi = (selector) => `pierce/${selector}`

async function waitForShadowPresence(page, selector, present, timeout = 5_000) {
  await page.waitForFunction(
    (hostId, sel, expectPresent) => {
      const host = document.getElementById(hostId)
      return ((host?.shadowRoot?.querySelector(sel) ?? null) !== null) === expectPresent
    },
    { timeout },
    HOST_ID,
    selector,
    present,
  )
}

async function waitForShadowText(page, selector, expected, timeout = 5_000) {
  await page.waitForFunction(
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

async function shadowTextAll(page, selector) {
  return page.evaluate(
    (hostId, sel) => {
      const host = document.getElementById(hostId)
      return Array.from(host?.shadowRoot?.querySelectorAll(sel) ?? []).map((el) => el.textContent?.trim() ?? "")
    },
    HOST_ID,
    selector,
  )
}

/**
 * A small red dot that follows every scripted mouse move, plus a green pulse
 * on click — headless Chromium has no visible cursor of its own, and without
 * one a hover/click demo GIF just looks like the UI is changing on its own.
 * Lives in the main document (outside the overlay's shadow root), so it
 * survives the app's own client-side route changes untouched.
 */
async function setupCursor(page) {
  await page.evaluate(() => {
    const style = document.createElement("style")
    style.textContent = `
      #__demo-cursor {
        position: fixed; top: -100px; left: -100px; width: 16px; height: 16px;
        margin: -8px 0 0 -8px; border-radius: 50%;
        background: rgba(239, 68, 68, 0.9); border: 2px solid #fff;
        box-shadow: 0 0 8px rgba(0, 0, 0, 0.45);
        pointer-events: none; z-index: 2147483647;
        transition: left 90ms ease-out, top 90ms ease-out, transform 120ms ease-out;
      }
      #__demo-cursor.__demo-cursor-click { transform: scale(1.8); background: rgba(34, 197, 94, 0.95); }
    `
    document.head.appendChild(style)
    const dot = document.createElement("div")
    dot.id = "__demo-cursor"
    document.body.appendChild(dot)
  })
}

async function moveCursor(page, x, y, steps = 20) {
  await page.mouse.move(x, y, { steps })
  await page.evaluate(
    (px, py) => {
      const dot = document.getElementById("__demo-cursor")
      if (dot !== null) {
        dot.style.left = `${px}px`
        dot.style.top = `${py}px`
      }
    },
    x,
    y,
  )
}

/** Center of the `index`-th match for `selector`, scrolled into view first — the Settings tab in particular is taller than the docked panel. */
async function centerOf(page, selector, { shadow = false, index = 0 } = {}) {
  const handles = await page.$$(shadow ? mi(selector) : selector)
  const handle = handles[index]
  if (handle === undefined) throw new Error(`Element not found: ${selector} [${index}]`)
  await handle.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }))
  await sleep(150)
  const box = await handle.boundingBox()
  if (box === null) throw new Error(`Element not visible: ${selector} [${index}]`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function hoverTo(page, selector, opts = {}) {
  const { x, y } = await centerOf(page, selector, opts)
  await moveCursor(page, x, y)
}

async function clickAt(page, selector, opts = {}) {
  await hoverTo(page, selector, opts)
  await page.evaluate(() => document.getElementById("__demo-cursor")?.classList.add("__demo-cursor-click"))
  await page.mouse.down()
  await sleep(60)
  await page.mouse.up()
  await page.evaluate(() => document.getElementById("__demo-cursor")?.classList.remove("__demo-cursor-click"))
}

/** Mirrors tests/browser/src/harness/overlay.ts's `activatePicker` — expand the dock if collapsed, then turn picking on. */
async function activatePicker(page) {
  const toggle = await page.$(mi(".mi-toggle"))
  if (toggle !== null) {
    await clickAt(page, ".mi-toggle-btn:not(.mi-toggle-pick)", { shadow: true })
    await page.waitForSelector(mi(".mi-dock"), { visible: true })
  }
  await page.waitForSelector(mi(".mi-picker-btn"), { visible: true })
  await clickAt(page, ".mi-picker-btn", { shadow: true })
  await waitForShadowPresence(page, ".mi-picking-banner", true)
}

async function selectViaPicker(page, pageSelector, expectedComponent) {
  await activatePicker(page)
  await hoverTo(page, pageSelector)
  await waitForShadowText(page, ".mi-hb-component", expectedComponent)
  await sleep(500)
  await clickAt(page, pageSelector)
  await waitForShadowText(page, ".mi-crumb-current", expectedComponent)
}

async function openTab(page, label) {
  await clickAt(page, `.mi-sidebar-btn[aria-label="${label}"]`, { shadow: true })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  for (const pkg of ["protocol", "runtime", "transform", "server", "overlay", "adapter-kit", "vite"]) {
    if (!existsSync(path.join(ROOT, "packages", pkg, "dist"))) {
      console.error(`packages/${pkg}/dist is missing — run "pnpm build" first.`)
      process.exit(1)
    }
  }

  console.log("Starting the playground's Vite dev server…")
  const viteServer = await createViteServer({
    root: PLAYGROUND_DIR,
    logLevel: "warn",
    server: { port: args.port, strictPort: false },
  })
  await viteServer.listen()
  const address = viteServer.httpServer?.address()
  const port = typeof address === "object" && address !== null ? address.port : args.port
  const url = `http://localhost:${port}/`
  console.log(`Playground running at ${url}`)

  const browser = await puppeteer.launch({
    headless: !args.headful,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport(VIEWPORT)
    await page.goto(url, { waitUntil: "networkidle0" })
    await page.waitForSelector("#home-page", { visible: true })
    await page.waitForSelector(mi(".mi-toggle"), { visible: true })
    await setupCursor(page)
    await sleep(500)

    console.log(`Recording to ${args.out}`)
    const recorder = await page.screencast({
      path: args.out,
      format: "gif",
      scale: 0.65,
      colors: 160,
      loop: Infinity,
    })

    // --- Scene 1: pick a nested component (Greeting) on the home page -----
    await selectViaPicker(page, "#greeting", "Greeting")
    await sleep(800)

    // --- Scene 2: pick the parent (HomePage) and open its Elements tab,
    // showing Greeting/Counter as clickable nested-component chips ---------
    await selectViaPicker(page, "#home-page > p", "HomePage")
    await sleep(300)
    await openTab(page, "Elements")
    await waitForShadowPresence(page, ".mi-elements-tree", true)
    await sleep(700)
    const chips = await shadowTextAll(page, ".mi-preview-component-link")
    const counterChipIndex = chips.indexOf("Counter")
    if (counterChipIndex >= 0) {
      await clickAt(page, ".mi-preview-component-link", { shadow: true, index: counterChipIndex })
      await openTab(page, "Components")
      await waitForShadowText(page, ".mi-crumb-current", "Counter")
      await sleep(600)
    }

    // --- Scene 3: navigate to the state demo page and watch History fill in
    // as real state changes ------------------------------------------------
    await clickAt(page, "#nav-state-demo")
    await page.waitForSelector("#state-demo-page", { visible: true })
    await sleep(300)

    await selectViaPicker(page, "#count-value", "StateDemoPage")
    await openTab(page, "History")
    await waitForShadowPresence(page, ".mi-history", true)
    await sleep(500)

    for (let i = 0; i < 3; i++) {
      await clickAt(page, "#increment-btn")
      await sleep(350)
    }
    await clickAt(page, "#notifications-checkbox")
    await sleep(350)
    await clickAt(page, "#add-task-btn")
    await sleep(800)

    // --- Scene 4: turn on redraw-flash from the Settings tab and trigger it
    await openTab(page, "Settings")
    await waitForShadowPresence(page, ".mi-settings", true)
    await sleep(300)
    await clickAt(page, "#mi-redraw-flash-enabled", { shadow: true })
    await sleep(300)

    await clickAt(page, "#increment-btn")
    await waitForShadowPresence(page, ".mi-flash-rect", true)
    await waitForShadowPresence(page, ".mi-flash-rect", false)
    await sleep(300)
    await clickAt(page, "#increment-btn")
    await waitForShadowPresence(page, ".mi-flash-rect", true)
    await waitForShadowPresence(page, ".mi-flash-rect", false)
    await sleep(700)

    await recorder.stop()
    console.log("Done.")
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
