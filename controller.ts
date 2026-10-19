import type { Plugin } from "@opencode/plugin";
import { cleanupOpenpod, registerCommand } from "./command";

export async function registerController(
  ctx: Plugin.Context,
  deps: { writeLog: (message: string) => void; openpodRoot: string },
): Promise<() => void> {
  const { writeLog, openpodRoot } = deps;

  await registerCommand(ctx, { writeLog, openpodRoot });

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
            void cleanupOpenpod(sessionID, { writeLog, openpodRoot });
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        writeLog(`event subscription error: ${err}`);
      }
    }
  })();

  return () => controller.abort();
}
