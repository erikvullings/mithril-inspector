import m from "mithril"
import type { ClassComponent, Vnode, VnodeDOM } from "mithril"

/**
 * Class component (§6.5) driving a native `<dialog>` (§19.2 "dialog/high
 * z-index content"). Class *declarations* are registered for display-name
 * resolution but not lifecycle-wrapped in Phase 1 — element picking still
 * works via `source()` (see packages/runtime/README.md).
 */
export class DialogPage implements ClassComponent {
  private dialogEl: HTMLDialogElement | null = null

  oncreate(vnode: VnodeDOM): void {
    this.dialogEl = vnode.dom.querySelector<HTMLDialogElement>("dialog")
  }

  private readonly open = (): void => {
    this.dialogEl?.showModal()
  }

  private readonly close = (): void => {
    this.dialogEl?.close()
  }

  view(): Vnode {
    return m("div#dialog-page.page", [
      m("h2", "Dialog & high z-index content"),
      m("button#open-dialog-btn", { onclick: this.open }, "Open dialog"),
      m(
        "dialog#demo-dialog",
        { style: "z-index: 9999;" },
        m("div.dialog-content", [
          m("p#dialog-text", "This native <dialog> renders in the top layer above everything else."),
          m("button#close-dialog-btn", { onclick: this.close }, "Close"),
        ]),
      ),
    ])
  }
}
