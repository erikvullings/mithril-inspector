import { describe, expect, it, vi } from "vitest"

import {
  boundingRect,
  createFrameScheduler,
  nodesOfDomRange,
  rectOfElement,
  rectsOfDomRange,
  rectsOfNodes,
  type HighlightRect,
  type RafHost,
} from "./highlight.js"

function elementAt(rect: Partial<DOMRect> & { left: number; top: number; width: number; height: number }): Element {
  const el = document.createElement("div")
  el.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect
  return el
}

/** A controllable rAF host: frames only run when `flush()` is called. */
function fakeRaf(): RafHost & { flush(): void; pending(): number } {
  let next = 1
  const queued = new Map<number, (t: number) => void>()
  return {
    requestAnimationFrame(cb) {
      const id = next++
      queued.set(id, cb)
      return id
    },
    cancelAnimationFrame(id) {
      queued.delete(id)
    },
    flush() {
      const callbacks = [...queued.values()]
      queued.clear()
      for (const cb of callbacks) cb(0)
    },
    pending() {
      return queued.size
    },
  }
}

describe("rectOfElement", () => {
  it("reads viewport coordinates from getBoundingClientRect", () => {
    const el = elementAt({ left: 10, top: 20, width: 100, height: 40 })
    expect(rectOfElement(el)).toEqual({ left: 10, top: 20, width: 100, height: 40 })
  })
})

describe("rectsOfNodes", () => {
  it("produces one rect per element node and skips text/comment nodes", () => {
    const a = elementAt({ left: 0, top: 0, width: 10, height: 10 })
    const b = elementAt({ left: 5, top: 5, width: 20, height: 20 })
    const text = document.createTextNode("hi")
    const rects = rectsOfNodes([a, text, b])
    expect(rects).toEqual([
      { left: 0, top: 0, width: 10, height: 10 },
      { left: 5, top: 5, width: 20, height: 20 },
    ])
  })

  it("returns an empty array when there are no element nodes", () => {
    expect(rectsOfNodes([document.createTextNode("x")])).toEqual([])
  })
})

describe("nodesOfDomRange (§8.6, §9.3 ancestor/component highlighting)", () => {
  it("returns [] when first is null", () => {
    expect(nodesOfDomRange({ first: null, last: null })).toEqual([])
  })

  it("returns a single node when first and last are the same node", () => {
    const el = elementAt({ left: 0, top: 0, width: 1, height: 1 })
    expect(nodesOfDomRange({ first: el, last: el })).toEqual([el])
  })

  it("returns a single node when last is null (no known end)", () => {
    const el = elementAt({ left: 0, top: 0, width: 1, height: 1 })
    expect(nodesOfDomRange({ first: el, last: null })).toEqual([el])
  })

  it("walks siblings from first to last inclusive (a fragment-root component's range)", () => {
    const parent = document.createElement("div")
    const a = elementAt({ left: 0, top: 0, width: 1, height: 1 })
    const b = elementAt({ left: 0, top: 0, width: 1, height: 1 })
    const c = elementAt({ left: 0, top: 0, width: 1, height: 1 })
    const trailing = elementAt({ left: 0, top: 0, width: 1, height: 1 })
    parent.append(a, b, c, trailing)
    expect(nodesOfDomRange({ first: a, last: c })).toEqual([a, b, c])
  })

  it("stops gracefully if last is never reached by walking nextSibling (malformed range)", () => {
    const parent = document.createElement("div")
    const a = elementAt({ left: 0, top: 0, width: 1, height: 1 })
    const b = elementAt({ left: 0, top: 0, width: 1, height: 1 })
    parent.append(a, b)
    const stray = elementAt({ left: 0, top: 0, width: 1, height: 1 }) // never appended
    expect(nodesOfDomRange({ first: a, last: stray })).toEqual([a, b])
  })
})

describe("rectsOfDomRange", () => {
  it("produces one rect per element across the range, skipping text nodes", () => {
    const parent = document.createElement("div")
    const a = elementAt({ left: 1, top: 2, width: 3, height: 4 })
    const text = document.createTextNode("x")
    const b = elementAt({ left: 5, top: 6, width: 7, height: 8 })
    parent.append(a, text, b)
    expect(rectsOfDomRange({ first: a, last: b })).toEqual([
      { left: 1, top: 2, width: 3, height: 4 },
      { left: 5, top: 6, width: 7, height: 8 },
    ])
  })

  it("returns [] for an empty range", () => {
    expect(rectsOfDomRange({ first: null, last: null })).toEqual([])
  })
})

describe("boundingRect", () => {
  it("unions several rectangles (fragment range)", () => {
    const rects: HighlightRect[] = [
      { left: 10, top: 10, width: 20, height: 20 }, // right/bottom = 30/30
      { left: 5, top: 40, width: 10, height: 10 }, // right/bottom = 15/50
    ]
    expect(boundingRect(rects)).toEqual({ left: 5, top: 10, width: 25, height: 40 })
  })

  it("returns null for an empty set", () => {
    expect(boundingRect([])).toBeNull()
  })
})

describe("createFrameScheduler — one update per animation frame (§17)", () => {
  it("coalesces many requests into a single callback per frame", () => {
    const raf = fakeRaf()
    const callback = vi.fn()
    const scheduler = createFrameScheduler(callback, raf)

    scheduler.request()
    scheduler.request()
    scheduler.request()
    expect(raf.pending()).toBe(1) // three requests, one frame queued
    expect(callback).not.toHaveBeenCalled()

    raf.flush()
    expect(callback).toHaveBeenCalledTimes(1)
    expect(scheduler.hasPending()).toBe(false)
  })

  it("stays idle until the next request (no self-rescheduling)", () => {
    const raf = fakeRaf()
    const callback = vi.fn()
    const scheduler = createFrameScheduler(callback, raf)
    scheduler.request()
    raf.flush()
    expect(callback).toHaveBeenCalledTimes(1)
    // No further frames queued on their own — idle CPU near zero.
    expect(raf.pending()).toBe(0)
    scheduler.request()
    raf.flush()
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it("cancel() drops a pending frame", () => {
    const raf = fakeRaf()
    const callback = vi.fn()
    const scheduler = createFrameScheduler(callback, raf)
    scheduler.request()
    scheduler.cancel()
    expect(scheduler.hasPending()).toBe(false)
    raf.flush()
    expect(callback).not.toHaveBeenCalled()
  })
})
