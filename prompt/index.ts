import type { Plugin } from "@opencode/plugin";

import type { OpenpodContext } from "../context";

import { handle } from "./handle";

export async function registerPrompt(
  ctx: Plugin.Context,
  deps: OpenpodContext,
): Promise<void> {
  const { logger } = deps;

  await logger.log("registering prompt");

  await ctx.session.hook("prompt", async (event) => {
    const session = await ctx.session.get({ sessionID: event.sessionID });
    const dir = session.location.directory;

    const params = {
      ctx: deps,
      sessionId: event.sessionID,
      dir,
      move: (sessionId: string, directory: string) => {
        void ctx.session.move({ sessionID: sessionId, directory });
      },
    };

    await handle(params);
  });
}
