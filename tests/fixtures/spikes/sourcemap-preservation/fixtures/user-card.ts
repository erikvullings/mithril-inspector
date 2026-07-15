import m from "mithril"

export interface UserCardAttrs {
  name: string
  onEdit: () => void
}

export const UserCard = {
  view: ({ attrs }: { attrs: UserCardAttrs }) =>
    m("article.user-card", [
      m("h2", attrs.name),
      m("button", { onclick: attrs.onEdit }, "Edit"), m("span.spacer"),
    ]),
}
