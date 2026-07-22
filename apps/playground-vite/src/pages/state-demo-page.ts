import m from "mithril"
import type { Component, Vnode } from "mithril"

interface Task {
  readonly id: number
  readonly label: string
  done: boolean
}

interface Session {
  /** Deliberately named like the real-world false positive that used to trip up §15's substring-based redaction — plural "tokens" now stays visible, only actual secret-shaped keys (authToken) get redacted. */
  readonly tokens: readonly string[]
  readonly authToken: string
  readonly lastLogin: { readonly device: string; readonly ip: string }
}

interface DemoState {
  count: number
  label: string
  notificationsEnabled: boolean
  tasks: Task[]
  session: Session
}

/**
 * Closure component (§6.5) returning a plain object literal directly —
 * routing it through an intermediate named variable (`const state = {...};
 * return state`) confuses the transform's static component-detection
 * heuristic, which then treats that inner object as its own component named
 * after the variable instead of crediting this factory. `view` is a regular
 * method (not an arrow) so `this` inside it — and inside the arrow-function
 * handlers closed over it — resolves to the live per-instance state object
 * at call time; real data fields (`count`, `label`, `notificationsEnabled`,
 * `tasks`) sit alongside `view` exactly like the idiomatic pattern the
 * runtime's state preview (task 0020/0022) is built to surface: primitives,
 * a boolean, and a nested array of objects, all visible as real key/value
 * entries in the overlay's Components tab State panel. `session` nests an
 * object two levels deep and includes a redacted-looking `authToken`
 * alongside a plain `tokens` field, to exercise the preview tree's
 * expand/collapse and §15 redaction together.
 */
export const StateDemoPage = (): Component & DemoState => {
  let nextId = 3
  return {
    count: 0,
    label: "Ada Lovelace",
    notificationsEnabled: true,
    tasks: [
      { id: 1, label: "Write the changelog", done: false },
      { id: 2, label: "Review the PR", done: true },
    ],
    session: {
      tokens: ["read:tasks", "write:tasks"],
      authToken: "sk-demo-xyz789",
      lastLogin: { device: "MacBook Pro", ip: "10.0.0.42" },
    },
    view(this: DemoState, _vnode: Vnode) {
      return m("div#state-demo-page.page", [
        m("h2", "State demo"),
        m("p", "A closure component with real object-literal state — inspect it in the overlay's Components tab."),
        m("p", `Last login: ${this.session.lastLogin.device} (${this.session.lastLogin.ip})`),
        m("div", [
          m("button#decrement-btn", { onclick: () => (this.count -= 1) }, "−"),
          m("span#count-value", ` ${this.count} `),
          m("button#increment-btn", { onclick: () => (this.count += 1) }, "+"),
        ]),
        m("div", [
          m("label", [
            "Name: ",
            m("input#label-input", {
              value: this.label,
              oninput: (event: Event) => (this.label = (event.target as HTMLInputElement).value),
            }),
          ]),
        ]),
        m("div", [
          m("label", [
            m("input#notifications-checkbox", {
              type: "checkbox",
              checked: this.notificationsEnabled,
              onclick: () => (this.notificationsEnabled = !this.notificationsEnabled),
            }),
            " Notifications enabled",
          ]),
        ]),
        m(
          "ul#task-list",
          this.tasks.map((task) =>
            m("li", { key: task.id }, [
              m("input", {
                type: "checkbox",
                checked: task.done,
                onclick: () => (task.done = !task.done),
              }),
              ` ${task.label}`,
            ]),
          ),
        ),
        m(
          "button#add-task-btn",
          {
            onclick: () => {
              nextId += 1
              this.tasks = [...this.tasks, { id: nextId, label: `New task ${nextId}`, done: false }]
            },
          },
          "Add task",
        ),
      ])
    },
  }
}
