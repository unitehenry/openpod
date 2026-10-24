import { execSync } from "node:child_process";

export function isCommandAvailable(command: string): boolean {
  try {
    if (process.platform === "win32") {
      execSync(`where ${command}`, { stdio: "ignore" });
    } else {
      execSync(`command -v ${command}`, {
        stdio: "ignore",
        shell: "/bin/sh",
      });
    }
    return true;
  } catch {
    return false;
  }
}
