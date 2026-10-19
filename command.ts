import type { Plugin } from "@opencode/plugin";
import * as fs from "node:fs";
import * as path from "node:path";

import type { OpenpodContext } from "./setup";

export async function clearAllOpenpod(deps: OpenpodContext): Promise<void> {
  const { writeLog, openpodRoot } = deps;
  writeLog("[clear] starting full openpod cleanup");

  try {
    if (!fs.existsSync(openpodRoot)) {
      writeLog("[clear] openpod root does not exist");
      return;
    }

    // Clean up each session/pod individually (stops + deletes lima + removes dir)
    const entries = fs.readdirSync(openpodRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionID = entry.name;
        await deps.cleanupOpenpod(sessionID);
      }
    }

    // Remove the root directory entirely (includes .log etc.)
    fs.rmSync(openpodRoot, { recursive: true, force: true });
    writeLog(`[clear] removed entire directory ${openpodRoot}`);
  } catch (err) {
    writeLog(`[clear] error during cleanup: ${err}`);
  }
}

export async function registerCommand(
  ctx: Plugin.Context,
  deps: OpenpodContext,
): Promise<void> {
  const { writeLog } = deps;
  writeLog("registering commands");

  await ctx.command.transform((editor) => {
    editor.add({
      name: "clear-openpod",
      description:
        "Stop and delete all openpod Lima instances and remove the entire ~/.local/share/openpod directory",
      execute: async ({ sessionID }) => {
        await clearAllOpenpod(deps);
        await ctx.session.remove({ sessionID });
      },
    });
  });
}
