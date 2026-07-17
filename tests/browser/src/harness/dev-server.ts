import { createServer, type ViteDevServer } from "vite"

import { mithrilInspector, type MithrilInspectorOptions } from "@mithril-inspector/vite"

import { getFreePort } from "./free-port.js"

export interface DevServerHandle {
  readonly url: string
  readonly server: ViteDevServer
  close(): Promise<void>
}

/**
 * A real, in-process Vite dev server with the inspector plugin wired in —
 * no CLI subprocess, so failures surface as normal thrown errors/stack traces.
 */
export async function startDevServer(root: string, options: MithrilInspectorOptions = {}): Promise<DevServerHandle> {
  const port = await getFreePort()
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: mithrilInspector(options, { NODE_ENV: "development" }),
    server: { port, strictPort: true, host: "127.0.0.1" },
  })
  await server.listen()

  return {
    url: `http://127.0.0.1:${port}`,
    server,
    async close() {
      await server.close()
    },
  }
}
