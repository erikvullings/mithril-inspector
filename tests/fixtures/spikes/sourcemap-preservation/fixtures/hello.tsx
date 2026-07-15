/** @jsx m */
import m from "mithril"

export interface HelloAttrs {
  subject: string
}

export const Hello = {
  view: ({ attrs }: { attrs: HelloAttrs }) => (
    <section class="hello">
      <h1>Hello, {attrs.subject}</h1>
    </section>
  ),
}
