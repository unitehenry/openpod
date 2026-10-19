import type { Plugin } from "@opencode/plugin";
import { cleanupOpenpod, registerCommand } from "./command";

import type { OpenpodContext } from "./setup";

export async function registerController(
  ctx: Plugin.Context,
  deps: OpenpodContext,
): Promise<() => void> {
  await registerCommand(ctx, deps);

  // Listen for session removal (via events, since there is no ctx.session.hook("remove"))
  // and clean up the corresponding openpod directory + lima instance.
  const controller = new AbortController();
  void (async () => {
    try {
      for await (const ev of ctx.event.subscribe({
        signal: controller.signal,
      })) {
        if (ev.type === "session.deleted") {
          const props: any = (ev as any).properties ?? ev;
          const sessionID: string | undefined =
            props.sessionID ??
            props.id ??
            props.info?.id ??
            (ev as any).sessionID;
          if (sessionID) {
            void cleanupOpenpod(sessionID, deps);
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        deps.writeLog(`event subscription error: ${err}`);
      }
    }
  })();

  return () => controller.abort();
}
