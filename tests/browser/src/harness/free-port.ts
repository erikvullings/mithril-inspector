import { createServer } from "node:net"

/** An OS-assigned free TCP port, so parallel dev servers never collide. */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, () => {
      const address = server.address()
      if (address === null || typeof address === "string") {
        reject(new Error("Could not determine a free port."))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}
