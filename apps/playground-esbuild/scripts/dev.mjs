import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import * as esbuild from "esbuild"

import { mithrilInspector } from "@mithril-inspector/esbuild"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")

const ctx = await esbuild.context({
  entryPoints: [join(root, "src/main.ts")],
  bundle: true,
  outfile: join(root, "dist/main.js"),
  format: "esm",
  sourcemap: true,
  define: { __DEV__: "true" },
  logLevel: "info",
  plugins: [
    mithrilInspector({
      root,
      editor: "code",
      devServer: { servedir: root },
    }),
  ],
})

await ctx.watch()

process.on("SIGINT", () => {
  void ctx.dispose().then(() => process.exit(0))
})
