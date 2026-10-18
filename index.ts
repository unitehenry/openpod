import { Plugin } from "@opencode/plugin"
import { execSync } from "child_process"

function isCommandAvailable(command: string): boolean {
  try {
    if (process.platform === "win32") {
      execSync(`where ${command}`, { stdio: "ignore" })
    } else {
      execSync(`command -v ${command}`, { stdio: "ignore", shell: "/bin/sh" })
    }
    return true
  } catch {
    return false
  }
}

export default Plugin.define({
  id: "openpod",
  async setup(ctx) {
    if (!isCommandAvailable("limactl")) {
      throw new Error(
        "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
      )
    }
  },
})
