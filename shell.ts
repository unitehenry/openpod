import type { Plugin } from "@opencode/plugin";
import * as path from "node:path";

export async function registerShell(
  ctx: Plugin.Context,
  deps: { writeLog: (message: string) => void; openpodRoot: string },
): Promise<void> {
  const { writeLog, openpodRoot } = deps;

  function getLimaName(dir: string): string | null {
    try {
      writeLog(`get lima name for ${openpodRoot} ${dir}`);
      const rel = path.relative(openpodRoot, dir);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return null;
      }
      const first = rel.split(path.sep).find((p) => p.length > 0);
      return first || null;
    } catch {
      return null;
    }
  }

  writeLog("registering create.before");

  await ctx.shell.hook("create.before", async (event) => {
    const limaName = getLimaName(event.cwd);

    if (limaName) {
      const originalCommand = event.command;
      const escapedCwd = event.cwd.replace(/'/g, "'''");
      const escapedCmd = originalCommand.replace(/'/g, "'''");
      event.command = `limactl shell --preserve-env --workdir='${escapedCwd}' ${limaName} bash -c '${escapedCmd}'`;
      writeLog(
        `redirected shell command for lima ${limaName} (cwd=${event.cwd})`,
      );
    }
  });
}
