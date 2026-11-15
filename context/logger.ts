import { appendFile, mkdir } from "node:fs/promises";
import * as path from "node:path";

export type Logger = {
  log: (message: string, level?: string) => Promise<void>;
};

export function initLogger(openpodRoot: string): Logger {
  const logDir = path.join(openpodRoot, ".log");
  const logFile = path.join(logDir, "openpod.log");
  let queue = Promise.resolve();

  function log(message: string, level: string = "info"): Promise<void> {
    const timestamp = new Date().toISOString();
    const levelPart = level === "info" ? "" : `[${level}] `;
    const entry = `[${timestamp}] [openpod] ${levelPart}${message}\n`;

    // Writes are queued to keep log order, but callers do not need to wait.
    queue = queue
      .then(async () => {
        await mkdir(logDir, { recursive: true });
        await appendFile(logFile, entry);
      })
      .catch(() => {
        // ignore logging failures
      });

    return queue;
  }

  return { log };
}
