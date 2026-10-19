import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type OpenpodContext = {
  writeLog: (message: string, level?: string) => void;
  openpodRoot: string;
  cleanupOpenpod: (sessionID: string) => Promise<void>;
};

export async function registerSetup(): Promise<OpenpodContext> {
  const openpodRoot = path.join(os.homedir(), ".local", "share", "openpod");
  const logDir = path.join(openpodRoot, ".log");
  const logFile = path.join(logDir, "openpod.log");

  function writeLog(message: string, level: string = "info"): void {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      const timestamp = new Date().toISOString();
      const levelPart = level === "info" ? "" : `[${level}] `;
      fs.appendFileSync(
        logFile,
        `[${timestamp}] [openpod] ${levelPart}${message}
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

  async function cleanupOpenpod(sessionID: string): Promise<void> {
    if (!sessionID || typeof sessionID !== "string") return;

    const limaName = sessionID;
    const podDir = path.join(openpodRoot, sessionID);

    writeLog(`[cleanup] starting for ${sessionID}`);

    // best-effort stop (ignore errors)
    try {
      spawnSync("limactl", ["stop", limaName, "--force"], { stdio: "ignore" });
      writeLog(`[cleanup] stopped ${limaName} (if running)`);
    } catch {
      // ignore
    }

    // delete the lima instance
    try {
      const result = spawnSync("limactl", ["delete", limaName, "--force"], {
        stdio: "ignore",
      });
      writeLog(
        `[cleanup] limactl delete ${limaName} exited with ${result.status}`,
      );
    } catch (err) {
      writeLog(`[cleanup] limactl delete error for ${limaName}: ${err}`);
    }

    // remove the openpod directory
    try {
      if (fs.existsSync(podDir)) {
        fs.rmSync(podDir, { recursive: true, force: true });
        writeLog(`[cleanup] removed directory ${podDir}`);
      } else {
        writeLog(`[cleanup] directory did not exist: ${podDir}`);
      }
    } catch (err) {
      writeLog(`[cleanup] failed to remove ${podDir}: ${err}`);
    }
  }

  if (!isCommandAvailable("limactl")) {
    writeLog(
      "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
      "error",
    );
    throw new Error(
      "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
    );
  }

  return { writeLog, openpodRoot, cleanupOpenpod };
}
