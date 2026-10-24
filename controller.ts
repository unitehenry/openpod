import type { Plugin } from "@opencode/plugin";

import type { OpenpodContext } from "./context";

export async function registerController(
  ctx: Plugin.Context,
  deps: OpenpodContext,
): Promise<() => void> {
  // Listen for session removal (via events, since there is no ctx.session.hook("remove"))
  // and clean up the corresponding openpod directory + lima instance.
  const controller = new AbortController();
  void (async () => {
    try {
      for await (const ev of ctx.event.subscribe({
        signal: controller.signal,
      })) {
        if (ev.type === "session.deleted") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const props: any = (ev as any).properties ?? ev;
          const sessionID: string | undefined =
            props.sessionID ??
            props.id ??
            props.info?.id ??
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (ev as any).sessionID;
          if (sessionID) {
            void deps.cleanup.execute(sessionID);
          }
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        deps.logger.log(`event subscription error: ${err}`);
      }
    }
  })();

  return () => controller.abort();
}
