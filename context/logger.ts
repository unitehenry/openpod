import { appendFile, mkdir } from "node:fs/promises";
import * as path from "node:path";

export type Logger = {
  log: (message: string, level?: string) => Promise<void>;
};

export function initLogger(openpodRoot: string): Logger {
  const logDir = path.join(openpodRoot, ".log");
  const logFile = path.join(logDir, "openpod.log");

  async function log(message: string, level: string = "info"): Promise<void> {
    try {
      await mkdir(logDir, { recursive: true });
      const timestamp = new Date().toISOString();
      const levelPart = level === "info" ? "" : `[${level}] `;
      await appendFile(
        logFile,
        `[${timestamp}] [openpod] ${levelPart}${message}\n`,
      );
    } catch {
      // ignore logging failures
    }
  }

  return { log };
}
