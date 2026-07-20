import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import * as esbuild from "esbuild"

import { mithrilInspector } from "@mithril-inspector/esbuild"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")

// The plugin is still wired up here, deliberately — `minify: true` and no
// `includeInProduction` means its own dev-only guard (not this script)
// excludes all inspector code, proving the guard works even when a real
// project forgets to conditionally omit the plugin from its production
// config (§12.4 AC: "production/minified builds exclude all inspector code
// by default").
await esbuild.build({
  entryPoints: [join(root, "src/main.ts")],
  bundle: true,
  outfile: join(root, "dist/main.js"),
  format: "esm",
  minify: true,
  sourcemap: true,
  define: { __DEV__: "false" },
  logLevel: "info",
  plugins: [mithrilInspector({ root, editor: "code" })],
})

console.log("[playground-esbuild] production build complete: dist/main.js (inspector-free by default)")
