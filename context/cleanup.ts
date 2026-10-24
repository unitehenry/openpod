import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import * as path from "node:path";

import type { Logger } from "./log";

export type Cleanup = (sessionID: string) => Promise<void>;

export function createCleanup(
  openpodRoot: string,
  logger: Logger,
): Cleanup {
  return async function cleanup(sessionID: string): Promise<void> {
    if (!sessionID || typeof sessionID !== "string") return;

    const limaName = sessionID;
    const podDir = path.join(openpodRoot, sessionID);

    logger(`[cleanup] starting for ${sessionID}`);

    // best-effort stop (ignore errors)
    try {
      spawnSync("limactl", ["stop", limaName, "--force"], { stdio: "ignore" });
      logger(`[cleanup] stopped ${limaName} (if running)`);
    } catch {
      // ignore
    }

    // delete the lima instance
    try {
      const result = spawnSync("limactl", ["delete", limaName, "--force"], {
        stdio: "ignore",
      });
      logger(
        `[cleanup] limactl delete ${limaName} exited with ${result.status}`,
      );
    } catch (err) {
      logger(`[cleanup] limactl delete error for ${limaName}: ${err}`);
    }

    // remove the openpod directory
    try {
      if (fs.existsSync(podDir)) {
        fs.rmSync(podDir, { recursive: true, force: true });
        logger(`[cleanup] removed directory ${podDir}`);
      } else {
        logger(`[cleanup] directory did not exist: ${podDir}`);
      }
    } catch (err) {
      logger(`[cleanup] failed to remove ${podDir}: ${err}`);
    }
  };
}
