import m from "mithril"

// prettier-ignore
export const Odd = {
  view: () => m(
    // comment between callee and selector
    "div#odd" ,
      m ( "span" , "weird spacing" ) ,
    /* block comment */ m("b", "bold"), m("u",
      "split across lines"),
  ),
}
