import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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

export type OpenpodContext = {
  writeLog: (message: string, level?: string) => void;
  openpodRoot: string;
  cleanupOpenpod?: (sessionID: string) => Promise<void>;
};

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

export async function registerSetup(): Promise<OpenpodContext> {
  if (!isCommandAvailable("limactl")) {
    writeLog(
      "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
      "error",
    );
    throw new Error(
      "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
    );
  }

  return { writeLog, openpodRoot };
}
