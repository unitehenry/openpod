import { Plugin } from "@opencode/plugin";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { registerPrompt } from "./prompt";
import { registerShell } from "./shell";
import { registerCommand, cleanupOpenpod } from "./command";

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
    await registerCommand(ctx, { writeLog, openpodRoot });

    // Listen for session removal (via events, since there is no ctx.session.hook("remove"))
    // and clean up the corresponding openpod directory + lima instance.
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const ev of ctx.event.subscribe({
          signal: controller.signal,
        })) {
          if (ev.type === "session.deleted") {
            const props: any = (ev as any).properties ?? ev;
            const sessionID: string | undefined =
              props.sessionID ??
              props.id ??
              props.info?.id ??
              (ev as any).sessionID;
            if (sessionID) {
              void cleanupOpenpod(sessionID, { writeLog, openpodRoot });
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          writeLog(`event subscription error: ${err}`);
        }
      }
    })();

    return () => controller.abort();
  },
});
