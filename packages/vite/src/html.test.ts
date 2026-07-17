import { describe, expect, it } from "vitest"

import { OVERLAY_MODULE_ID, RESOLVED_OVERLAY_ID } from "./ids.js"
import { devVirtualUrl, overlayBootstrapTags } from "./html.js"

describe("devVirtualUrl", () => {
  it("encodes the NUL byte and applies base (Vite /@id/ convention)", () => {
    expect(devVirtualUrl(RESOLVED_OVERLAY_ID)).toBe("/@id/__x00__virtual:mithril-inspector/overlay")
    expect(devVirtualUrl(RESOLVED_OVERLAY_ID, "/app/")).toBe("/app/@id/__x00__virtual:mithril-inspector/overlay")
  })
})

describe("overlayBootstrapTags (§11.2 transformIndexHtml)", () => {
  it("injects a served /@id/ script in dev (a bare inline import is not rewritten)", () => {
    const tags = overlayBootstrapTags({ dev: true })
    expect(tags).toHaveLength(1)
    const [tag] = tags
    expect(tag?.tag).toBe("script")
    expect(tag?.attrs?.type).toBe("module")
    expect(String(tag?.attrs?.src)).toContain("/@id/")
    expect(String(tag?.attrs?.src)).toContain("virtual:mithril-inspector/overlay")
    expect(tag?.children).toBeUndefined()
    expect(tag?.injectTo).toBe("head-prepend")
  })

  it("injects an inline import in a (forced) production build so Rollup bundles it", () => {
    const tags = overlayBootstrapTags({ dev: false })
    const [tag] = tags
    expect(tag?.attrs?.src).toBeUndefined()
    expect(tag?.children).toContain(`import ${JSON.stringify(OVERLAY_MODULE_ID)}`)
    expect(tag?.injectTo).toBe("head-prepend")
  })

  it("never edits the application entry file", () => {
    expect(overlayBootstrapTags({ dev: true })).toHaveLength(1)
    expect(overlayBootstrapTags({ dev: false })).toHaveLength(1)
  })
})
