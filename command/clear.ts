import type { OpenpodContext } from "../context";
import { readdir, rm } from "node:fs/promises";

import { exists } from "../context/fs";

export async function clear(deps: OpenpodContext): Promise<void> {
  const { logger, openpodRoot } = deps;
  logger.log("[clear] starting full openpod cleanup");

  try {
    if (!(await exists(openpodRoot))) {
      logger.log("[clear] openpod root does not exist");
      return;
    }

    // Clean up each session/pod individually (stops + deletes lima + removes dir)
    const entries = await readdir(openpodRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionID = entry.name;
        await deps.cleanup.execute(sessionID);
      }
    }

    // Remove the root directory entirely (includes .log etc.)
    await rm(openpodRoot, { recursive: true, force: true });
    logger.log(`[clear] removed entire directory ${openpodRoot}`);
  } catch (err) {
    logger.log(`[clear] error during cleanup: ${err}`);
  }
}
