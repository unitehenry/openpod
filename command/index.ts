import type { Plugin } from "@opencode/plugin";

import type { OpenpodContext } from "../context";

import { clear } from "./clear";

const COMMAND_NAME = "clear-openpod";

export async function registerCommand(
  ctx: Plugin.Context,
  deps: OpenpodContext,
): Promise<void> {
  const { logger } = deps;
  logger.log("registering commands");

  await ctx.command.transform((editor) => {
    editor.add({
      name: COMMAND_NAME,
      description:
        "Stop and delete all openpod Lima instances and remove the entire ~/.local/share/openpod directory",
      execute: async ({ sessionID }) => {
        await clear(deps);
        await ctx.session.remove({ sessionID });
      },
    });
  });
}
