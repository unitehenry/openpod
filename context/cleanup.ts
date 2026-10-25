import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import * as path from "node:path";

import type { Logger } from "./logger";

export type Cleanup = {
  execute: (sessionID: string) => Promise<void>;
};

export function initCleanup(openpodRoot: string, logger?: Logger): Cleanup {
  const log = (message: string, level?: string) =>
    logger?.log?.(message, level);

  async function execute(sessionID: string): Promise<void> {
    if (!sessionID || typeof sessionID !== "string") return;

    const limaName = sessionID;
    const podDir = path.join(openpodRoot, sessionID);

    log(`[cleanup] starting for ${sessionID}`);

    // best-effort stop (ignore errors)
    try {
      spawnSync("limactl", ["stop", limaName, "--force"], { stdio: "ignore" });
      log(`[cleanup] stopped ${limaName} (if running)`);
    } catch {
      // ignore
    }

    // delete the lima instance
    try {
      const result = spawnSync("limactl", ["delete", limaName, "--force"], {
        stdio: "ignore",
      });
      log(`[cleanup] limactl delete ${limaName} exited with ${result.status}`);
    } catch (err) {
      log(`[cleanup] limactl delete error for ${limaName}: ${err}`);
    }

    // remove the openpod directory
    try {
      if (fs.existsSync(podDir)) {
        fs.rmSync(podDir, { recursive: true, force: true });
        log(`[cleanup] removed directory ${podDir}`);
      } else {
        log(`[cleanup] directory did not exist: ${podDir}`);
      }
    } catch (err) {
      log(`[cleanup] failed to remove ${podDir}: ${err}`);
    }
  }

  return { execute };
}
