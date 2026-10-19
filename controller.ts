import type { Plugin } from "@opencode/plugin";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export async function registerController(
  ctx: Plugin.Context,
  deps: { writeLog: (message: string) => void; openpodRoot: string },
): Promise<() => void> {
  const { writeLog, openpodRoot } = deps;

  async function cleanupOpenpod(sessionID: string): Promise<void> {
    if (!sessionID || typeof sessionID !== "string") return;

    const limaName = sessionID;
    const podDir = path.join(openpodRoot, sessionID);

    writeLog(`[cleanup] starting for ${sessionID}`);

    // best-effort stop (ignore errors)
    try {
      spawnSync("limactl", ["stop", limaName, "--force"], { stdio: "ignore" });
      writeLog(`[cleanup] stopped ${limaName} (if running)`);
    } catch {
      // ignore
    }

    // delete the lima instance
    try {
      const result = spawnSync("limactl", ["delete", limaName, "--force"], {
        stdio: "ignore",
      });
      writeLog(
        `[cleanup] limactl delete ${limaName} exited with ${result.status}`,
      );
    } catch (err) {
      writeLog(`[cleanup] limactl delete error for ${limaName}: ${err}`);
    }

    // remove the openpod directory
    try {
      if (fs.existsSync(podDir)) {
        fs.rmSync(podDir, { recursive: true, force: true });
        writeLog(`[cleanup] removed directory ${podDir}`);
      } else {
        writeLog(`[cleanup] directory did not exist: ${podDir}`);
      }
    } catch (err) {
      writeLog(`[cleanup] failed to remove ${podDir}: ${err}`);
    }
  }

  async function clearAllOpenpod(): Promise<void> {
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
          await cleanupOpenpod(sessionID);
        }
      }

      // Remove the root directory entirely (includes .log etc.)
      fs.rmSync(openpodRoot, { recursive: true, force: true });
      writeLog(`[clear] removed entire directory ${openpodRoot}`);
    } catch (err) {
      writeLog(`[clear] error during cleanup: ${err}`);
    }
  }

  writeLog("registering commands");

  await ctx.command.transform((editor) => {
    editor.add({
      name: "clear-openpod",
      description:
        "Stop and delete all openpod Lima instances and remove the entire ~/.local/share/openpod directory",
      execute: async ({ sessionID }) => {
        await clearAllOpenpod();
        await ctx.session.remove({ sessionID });
      },
    });
  });

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
            void cleanupOpenpod(sessionID);
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
