/**
 * Small DOM helpers for the picker: describing an element for the info badge
 * and finding the first *eligible* element under the pointer (§8.5), i.e. the
 * first hit that is not the overlay host or one of its descendants.
 */

/** A CSS-ish label for an element, e.g. `article.user-card` or `button#save`. */
export function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const id = element.id ? `#${element.id}` : ""
  const classes = Array.from(element.classList)
    .map((cls) => `.${cls}`)
    .join("")
  return `${tag}${id}${classes}`
}

/**
 * The first element under a viewport point that is not excluded (the overlay
 * host, §8.2) — resolves through overlapping/transparent layers via
 * `elementsFromPoint`. Returns `null` when only excluded elements are hit.
 */
export function eligibleElementAt(
  doc: Pick<Document, "elementsFromPoint">,
  x: number,
  y: number,
  isExcluded: (element: Element) => boolean,
): Element | null {
  const hits = doc.elementsFromPoint(x, y)
  for (const element of hits) {
    if (!isExcluded(element)) return element
  }
  return null
}

/** Whether `element` is `host` or lives inside it (subtree exclusion, §8.2). */
export function isWithinHost(element: Element, host: Element | null): boolean {
  if (host === null) return false
  return element === host || host.contains(element)
}
