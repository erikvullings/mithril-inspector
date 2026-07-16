import { describe, expect, it } from "vitest"

import {
  packageName,
  PROTOCOL_VERSION,
  isComponentId,
  isVNodeId,
  isModuleId,
  makeComponentId,
  makeVNodeId,
} from "./index.js"

describe("@mithril-inspector/protocol", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@mithril-inspector/protocol")
  })

  describe("PROTOCOL_VERSION", () => {
    it("is version 1", () => {
      expect(PROTOCOL_VERSION).toBe(1)
    })
  })

  describe("ID constructors", () => {
    it("creates valid ComponentId", () => {
      const id = makeComponentId(42)
      expect(id).toBe("c:42")
      expect(isComponentId(id)).toBe(true)
    })

    it("creates valid VNodeId", () => {
      const id = makeVNodeId(99)
      expect(id).toBe("v:99")
      expect(isVNodeId(id)).toBe(true)
    })
  })

  describe("ID guards", () => {
    it("validates ComponentId format", () => {
      expect(isComponentId("c:0")).toBe(true)
      expect(isComponentId("c:123")).toBe(true)
      expect(isComponentId("v:123")).toBe(false)
      expect(isComponentId("c:abc")).toBe(false)
      expect(isComponentId("invalid")).toBe(false)
    })

    it("validates VNodeId format", () => {
      expect(isVNodeId("v:0")).toBe(true)
      expect(isVNodeId("v:456")).toBe(true)
      expect(isVNodeId("c:456")).toBe(false)
      expect(isVNodeId("v:abc")).toBe(false)
      expect(isVNodeId("invalid")).toBe(false)
    })

    it("validates ModuleId format", () => {
      expect(isModuleId("m:path/to/file.ts")).toBe(true)
      expect(isModuleId("m:nested/module")).toBe(true)
      expect(isModuleId("c:123")).toBe(false)
      expect(isModuleId("v:456")).toBe(false)
      expect(isModuleId("invalid")).toBe(false)
    })
  })

  describe("type availability", () => {
    it("exports all required types and functions", () => {
      // Verify type constructors work as expected
      expect(makeComponentId(0)).toMatch(/^c:\d+$/)
      expect(makeVNodeId(0)).toMatch(/^v:\d+$/)
    })
  })
})
