import { afterEach, describe, expect, it } from "vitest"

import { describeElement, eligibleElementAt, isWithinHost } from "./element-info.js"

afterEach(() => {
  document.body.innerHTML = ""
})

describe("describeElement", () => {
  it("renders tag + id + classes", () => {
    const el = document.createElement("article")
    el.className = "user-card featured"
    expect(describeElement(el)).toBe("article.user-card.featured")
    el.id = "u42"
    expect(describeElement(el)).toBe("article#u42.user-card.featured")
  })

  it("renders a bare tag with no id/classes", () => {
    expect(describeElement(document.createElement("button"))).toBe("button")
  })
})

describe("isWithinHost", () => {
  it("matches the host and its descendants", () => {
    const host = document.createElement("div")
    const child = document.createElement("span")
    host.appendChild(child)
    expect(isWithinHost(host, host)).toBe(true)
    expect(isWithinHost(child, host)).toBe(true)
    expect(isWithinHost(document.createElement("p"), host)).toBe(false)
    expect(isWithinHost(child, null)).toBe(false)
  })
})

describe("eligibleElementAt", () => {
  it("returns the first hit that is not excluded", () => {
    const host = document.createElement("div")
    const app = document.createElement("button")
    const doc = { elementsFromPoint: () => [host, app] }
    expect(eligibleElementAt(doc, 5, 5, (el) => el === host)).toBe(app)
  })

  it("returns null when every hit is excluded", () => {
    const host = document.createElement("div")
    const doc = { elementsFromPoint: () => [host] }
    expect(eligibleElementAt(doc, 5, 5, (el) => el === host)).toBeNull()
  })

  it("returns null when nothing is under the pointer", () => {
    const doc = { elementsFromPoint: () => [] as Element[] }
    expect(eligibleElementAt(doc, 5, 5, () => false)).toBeNull()
  })
})
