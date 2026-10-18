import { Plugin } from "@opencode/plugin";
import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function isCommandAvailable(command: string): boolean {
  try {
    if (process.platform === "win32") {
      execSync(`where ${command}`, { stdio: "ignore" });
    } else {
      execSync(`command -v ${command}`, { stdio: "ignore", shell: "/bin/sh" });
    }
    return true;
  } catch {
    return false;
  }
}

function isGitEnabled(dir: string): boolean {
  try {
    const result = spawnSync(
      "git",
      ["-C", dir, "rev-parse", "--is-inside-work-tree"],
      {
        stdio: "ignore",
      },
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

function getRepoRoot(dir: string): string | null {
  try {
    const result = spawnSync(
      "git",
      ["-C", dir, "rev-parse", "--show-toplevel"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    if (result.status !== 0 || !result.stdout) {
      throw new Error(result.stderr?.toString() || "git rev-parse failed");
    }
    return result.stdout.trim();
  } catch (err) {
    console.log(`[openpod] failed to determine git root for ${dir}: ${err}`);
    return null;
  }
}

function cloneRepo(source: string, target: string): void {
  try {
    const result = spawnSync("git", ["clone", source, target], {
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(`git clone failed with exit code ${result.status}`);
    }
  } catch (err) {
    console.error(`[openpod] ${err}`);
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch {}
  }
}

export default Plugin.define({
  id: "openpod",
  async setup(ctx) {
    if (!isCommandAvailable("limactl")) {
      throw new Error(
        "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
      );
    }

    await ctx.session.hook("prompt", async (event) => {
      const session = await ctx.session.get({ sessionID: event.sessionID });
      const dir = session.location.directory;
      const gitEnabled = isGitEnabled(dir);
      console.log(
        `[openpod] session ${event.sessionID} prompt - gitEnabled: ${gitEnabled}`,
      );

      const openpodRoot = path.join(os.homedir(), ".local", "share", "openpod");
      const target = path.join(openpodRoot, event.sessionID);
      const needsMove = dir !== target;
      console.log(
        `[openpod] needs move for project dir ${dir}? ${needsMove} (target=${target})`,
      );

      if (!gitEnabled) {
        console.log(`[openpod] git is not enabled`);
        return;
      }

      if (!needsMove) {
        console.log(`[openpod] already in ${target} directory`);
        return;
      }

      if (fs.existsSync(target)) {
        console.log(`[openpod] ${target} already exists`);
        await ctx.session.move({
          sessionID: event.sessionID,
          directory: target,
        });
        return;
      }

      const repoRoot = getRepoRoot(dir);

      if (!repoRoot) {
        console.log(`[opencode] failed to get repo root`);
        return;
      }

      console.log(`[openpod] cloning ${repoRoot} -> ${target}`);
      fs.mkdirSync(openpodRoot, { recursive: true });

      cloneRepo(repoRoot, target);

      console.log(`[openpod] clone complete, moving session to ${target}`);
      await ctx.session.move({ sessionID: event.sessionID, directory: target });
    });
  },
});
