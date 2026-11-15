import type { Plugin } from "@opencode/plugin";

import type { OpenpodContext } from "../context";

import { wrap } from "./wrap";

export async function registerShell(
  ctx: Plugin.Context,
  deps: OpenpodContext,
): Promise<void> {
  const { logger } = deps;

  await logger.log("registering create.before");

  await ctx.shell.hook("create.before", async (event) => {
    event.command = await wrap(deps, event.cwd, event.command);
  });
}
