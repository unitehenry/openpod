import { rm } from "node:fs/promises";
import * as path from "node:path";

import { exec } from "./exec";
import { exists } from "./fs";
import type { Logger } from "./logger";

export type Cleanup = {
  execute: (sessionID: string) => Promise<void>;
};

export function initCleanup(openpodRoot: string, logger?: Logger): Cleanup {
  const log = async (message: string, level?: string): Promise<void> => {
    await logger?.log?.(message, level);
  };

  async function stopLimaInstance(limaName: string): Promise<void> {
    // best-effort stop (ignore errors)
    await exec("limactl", ["stop", limaName, "--force"]);
    await log(`[cleanup] stopped ${limaName} (if running)`);
  }

  async function deleteLimaInstance(limaName: string): Promise<void> {
    const result = await exec("limactl", ["delete", limaName, "--force"]);
    await log(
      `[cleanup] limactl delete ${limaName} exited with ${result.status}`,
    );
  }

  async function removePodDirectory(podDir: string): Promise<void> {
    try {
      if (await exists(podDir)) {
        await rm(podDir, { recursive: true, force: true });
        await log(`[cleanup] removed directory ${podDir}`);
      } else {
        await log(`[cleanup] directory did not exist: ${podDir}`);
      }
    } catch (err) {
      await log(`[cleanup] failed to remove ${podDir}: ${err}`);
    }
  }

  async function execute(sessionID: string): Promise<void> {
    if (!sessionID || typeof sessionID !== "string") return;

    const limaName = sessionID;
    const podDir = path.join(openpodRoot, sessionID);

    await log(`[cleanup] starting for ${sessionID}`);

    await stopLimaInstance(limaName);
    await deleteLimaInstance(limaName);
    await removePodDirectory(podDir);
  }

  return { execute };
}
