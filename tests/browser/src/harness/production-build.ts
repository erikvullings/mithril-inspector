import { build, preview, type PreviewServer } from "vite"

import { mithrilInspector } from "@mithril-inspector/vite"

import { getFreePort } from "./free-port.js"

export interface ProductionPreview {
  readonly url: string
  close(): Promise<void>
}

/**
 * A real `vite build` followed by serving the built output statically (§19.2
 * assertion 10). `enabled: true` isolates the command-based build exclusion
 * (§2.1) as the reason the output is clean, matching
 * packages/vite/src/build-exclusion.test.ts.
 */
export async function buildAndPreview(root: string): Promise<ProductionPreview> {
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: mithrilInspector({ enabled: true }, { NODE_ENV: "development" }),
    build: { outDir: "dist", emptyOutDir: true, minify: false, write: true },
  })

  const port = await getFreePort()
  const server: PreviewServer = await preview({
    root,
    configFile: false,
    logLevel: "silent",
    build: { outDir: "dist" },
    preview: { port, strictPort: true, host: "127.0.0.1" },
  })

  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.httpServer.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}
