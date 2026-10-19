import { Plugin } from "@opencode/plugin";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { registerPrompt } from "./prompt";
import { registerShell } from "./shell";
import { registerController } from "./controller";

const openpodRoot = path.join(os.homedir(), ".local", "share", "openpod");
const logDir = path.join(openpodRoot, ".log");
const logFile = path.join(logDir, "openpod.log");

function writeLog(message: string): void {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const timestamp = new Date().toISOString();
    fs.appendFileSync(
      logFile,
      `[${timestamp}] [openpod] ${message}
`,
    );
  } catch {
    // ignore logging failures
  }
}

function isCommandAvailable(command: string): boolean {
  try {
    if (process.platform === "win32") {
      execSync(`where ${command}`, { stdio: "ignore" });
    } else {
      execSync(`command -v ${command}`, { stdio: "ignore", shell: "/bin/sh" });
    }
    return true;
  } catch {
    return false;
  }
}

export default Plugin.define({
  id: "openpod",
  async setup(ctx) {
    if (!isCommandAvailable("limactl")) {
      throw new Error(
        "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
      );
    }

    await registerPrompt(ctx, { writeLog, openpodRoot });
    await registerShell(ctx, { writeLog, openpodRoot });

    return await registerController(ctx, { writeLog, openpodRoot });
  },
});
