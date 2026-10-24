import * as fs from "node:fs";
import * as path from "node:path";

export type Logger = (message: string, level?: string) => void;

export function initLog(openpodRoot: string): Logger {
  const logDir = path.join(openpodRoot, ".log");
  const logFile = path.join(logDir, "openpod.log");

  return function log(message: string, level: string = "info"): void {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      const timestamp = new Date().toISOString();
      const levelPart = level === "info" ? "" : `[${level}] `;
      fs.appendFileSync(
        logFile,
        `[${timestamp}] [openpod] ${levelPart}${message}\n`,
      );
    } catch {
      // ignore logging failures
    }
  };
}
