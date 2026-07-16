import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { spawnEditorProcess } from "./launch-editor-process.js"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mi-spawn-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe("spawnEditorProcess", () => {
  it("resolves once the process has started, without waiting for it to exit", async () => {
    await expect(spawnEditorProcess(process.execPath, ["--version"])).resolves.toBeUndefined()
  })

  it("rejects when the command does not exist", async () => {
    const missing = path.join(dir, "does-not-exist-editor-binary")
    await expect(spawnEditorProcess(missing, [])).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("passes arguments as a literal array without shell interpretation", async () => {
    const scriptPath = path.join(dir, "echo-argv.cjs")
    const outputPath = path.join(dir, "argv.json")
    const markerPath = path.join(dir, "pwned")
    writeFileSync(
      scriptPath,
      `require("fs").writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify(process.argv.slice(2)))\n`,
    )
    const dangerousArg = `$(touch ${markerPath}) && echo hi; rm -rf /tmp/nope`

    await spawnEditorProcess(process.execPath, [scriptPath, dangerousArg])
    await waitFor(() => existsSync(outputPath))

    expect(existsSync(markerPath)).toBe(false)
    const received = JSON.parse(readFileSync(outputPath, "utf8")) as string[]
    expect(received).toEqual([dangerousArg])
  })
})
