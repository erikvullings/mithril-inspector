import { spawn } from "node:child_process"

export type EditorProcessLauncher = (command: string, args: readonly string[]) => Promise<void>

/**
 * Launch the editor process (§10.2): `spawn` with an argument array, `shell:
 * false`, never a shell command string. Resolves once the process has
 * started; does not wait for exit, since terminal editors (vim) block for as
 * long as the user is editing and GUI editors detach and exit immediately.
 */
export const spawnEditorProcess: EditorProcessLauncher = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: "ignore", shell: false })
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
    child.once("error", (error) => {
      reject(error)
    })
  })
