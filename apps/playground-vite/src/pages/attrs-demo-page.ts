import m from "mithril"
import type { Component, Vnode } from "mithril"

interface Address {
  readonly city: string
  readonly zip: string
}

interface UserCardAttrs {
  readonly name: string
  readonly age: number
  readonly roles: readonly string[]
  readonly address: Address
  readonly active: boolean
  readonly onGreet: () => void
}

/**
 * A presentational child with no state of its own (§19.2 "attrs-only child")
 * — every value it renders comes straight from `attrs`, so it's the page to
 * inspect in the overlay's Components tab to see a rich Attrs panel: string,
 * number, boolean, array, nested object and callback props all as real
 * key/value entries, contrasted with the State demo's own component state.
 */
const UserCard: Component<UserCardAttrs> = {
  view: ({ attrs }) =>
    m("div.user-card", [
      m("h3#user-card-name", attrs.name),
      m("p", `${attrs.age} years old · ${attrs.active ? "active" : "inactive"}`),
      m("p", `Roles: ${attrs.roles.join(", ")}`),
      m("p", `${attrs.address.city}, ${attrs.address.zip}`),
      m("button#greet-btn", { onclick: attrs.onGreet }, "Greet"),
    ]),
}

interface DemoState {
  name: string
  age: number
  active: boolean
  greetCount: number
}

/** Closure component (§6.5) — its own state only drives the controls; the interesting data lives in the child's attrs below. */
export const AttrsDemoPage = (): Component & DemoState => {
  return {
    name: "Grace Hopper",
    age: 85,
    active: true,
    greetCount: 0,
    view(this: DemoState, _vnode: Vnode) {
      return m("div#attrs-demo-page.page", [
        m("h2", "Attrs demo"),
        m(
          "p",
          "A parent passing rich attrs into a presentational child — inspect UserCard (not this page) in the overlay's Components tab to see them.",
        ),
        m("div", [
          m("label", [
            "Name: ",
            m("input#name-input", {
              value: this.name,
              oninput: (event: Event) => (this.name = (event.target as HTMLInputElement).value),
            }),
          ]),
        ]),
        m("div", [
          m("button#age-decrement-btn", { onclick: () => (this.age -= 1) }, "−"),
          m("span#age-value", ` ${this.age} `),
          m("button#age-increment-btn", { onclick: () => (this.age += 1) }, "+"),
        ]),
        m("div", [
          m("label", [
            m("input#active-checkbox", {
              type: "checkbox",
              checked: this.active,
              onclick: () => (this.active = !this.active),
            }),
            " Active",
          ]),
        ]),
        m(UserCard, {
          name: this.name,
          age: this.age,
          roles: ["admin", "reviewer"],
          address: { city: "Arlington", zip: "22201" },
          active: this.active,
          onGreet: () => (this.greetCount += 1),
        }),
        m("p#greet-count", `Greeted ${this.greetCount} time(s).`),
      ])
    },
  }
}
