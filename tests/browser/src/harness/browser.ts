import puppeteer, { type Browser, type Page } from "puppeteer"

export function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })
}

export async function newPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  return page
}

/**
 * The overlay mounts into an isolated *open* shadow root (§8.2), so plain CSS
 * selectors never see it. Puppeteer's built-in `pierce/` query handler walks
 * through open shadow boundaries; every overlay-side selector in these tests
 * goes through this helper instead of a bare string.
 */
export const mi = (selector: string): string => `pierce/${selector}`
