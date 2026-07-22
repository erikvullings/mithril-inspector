import { describe, expect, it } from "vitest"

import {
  isVirtualModuleDependencyImport,
  OVERLAY_PACKAGE_ID,
  RESOLVED_OVERLAY_ID,
  RESOLVED_RUNTIME_ID,
  RUNTIME_PACKAGE_ID,
} from "./ids.js"

describe("isVirtualModuleDependencyImport", () => {
  it("is true for the runtime package id imported from the resolved runtime module", () => {
    expect(isVirtualModuleDependencyImport(RUNTIME_PACKAGE_ID, RESOLVED_RUNTIME_ID)).toBe(true)
  })

  it("is true for the overlay package id imported from the resolved overlay module", () => {
    expect(isVirtualModuleDependencyImport(OVERLAY_PACKAGE_ID, RESOLVED_OVERLAY_ID)).toBe(true)
  })

  it("is false for an unrelated id, even from a virtual importer", () => {
    expect(isVirtualModuleDependencyImport("mithril", RESOLVED_RUNTIME_ID)).toBe(false)
  })

  it("is false when the importer isn't a virtual module (a real project file importing it directly)", () => {
    expect(isVirtualModuleDependencyImport(RUNTIME_PACKAGE_ID, "/repo/src/App.ts")).toBe(false)
  })

  it("is false when there is no importer", () => {
    expect(isVirtualModuleDependencyImport(RUNTIME_PACKAGE_ID, undefined)).toBe(false)
  })
})
