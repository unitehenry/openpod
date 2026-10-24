import type { Plugin } from "@opencode/plugin";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import type { OpenpodContext } from "./context";

export async function registerPrompt(
  ctx: Plugin.Context,
  deps: OpenpodContext,
): Promise<void> {
  const { logger, openpodRoot } = deps;

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
      logger.log(`failed to determine git root for ${dir}: ${err}`);
      return null;
    }
  }

  function cloneRepo(source: string, target: string): void {
    try {
      logger.log(`cloning ${source} -> ${target}`);

      // Try to clone from the real remote (to get the latest default branch)
      const remoteResult = spawnSync(
        "git",
        ["-C", source, "remote", "get-url", "origin"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );

      if (remoteResult.status === 0 && remoteResult.stdout.trim()) {
        const remoteUrl = remoteResult.stdout.trim();

        // Query the remote directly for its current default branch (latest)
        const symrefResult = spawnSync(
          "git",
          ["-C", source, "ls-remote", "--symref", remoteUrl, "HEAD"],
          { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        );

        let cloneArgs = [remoteUrl, target];

        if (symrefResult.status === 0 && symrefResult.stdout) {
          // Example output:
          // ref: refs/heads/main	HEAD
          // <sha>	HEAD
          const match = symrefResult.stdout.match(/ref: refs\/heads\/(\S+)/);
          if (match) {
            const branch = match[1];
            logger.log(`cloning latest default branch ${branch} from remote`);
            cloneArgs = ["--branch", branch, remoteUrl, target];
          } else {
            logger.log(
              `cloning from remote ${remoteUrl} (using remote default branch)`,
            );
          }
        } else {
          logger.log(`cloning from remote ${remoteUrl} (default branch)`);
        }

        const result = spawnSync("git", ["clone", ...cloneArgs]);
        if (result.status !== 0) {
          throw new Error(`git clone failed with exit code ${result.status}`);
        }
        copyRemotes(source, target);
        return;
      }

      // Fallback: no "origin" remote, clone from local source and try to
      // respect its origin/HEAD if present.
      logger.log(
        "no origin remote configured, falling back to local source clone",
      );

      let args = [source, target];

      const headRef = spawnSync(
        "git",
        ["-C", source, "symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );

      if (headRef.status === 0 && headRef.stdout) {
        const ref = headRef.stdout.trim();
        const branch = ref.replace(/^refs\/remotes\/origin\//, "");
        if (branch) {
          logger.log(`cloning default branch ${branch} (from local origin/HEAD)`);
          args = ["--branch", branch, source, target];
        }
      } else {
        logger.log("no origin/HEAD ref found, cloning source as-is");
      }

      const result = spawnSync("git", ["clone", ...args]);
      if (result.status !== 0) {
        throw new Error(`git clone failed with exit code ${result.status}`);
      }
      copyRemotes(source, target);
    } catch (err) {
      logger.log(`${err}`);
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch {
        // ignore cleanup failure
      }
    }
  }

  function copyRemotes(source: string, target: string): void {
    try {
      logger.log(`copying remotes from ${source} to ${target}`);

      // clone always sets "origin" to point at the local source path;
      // remove it so we can restore the original remotes (if any)
      spawnSync("git", ["-C", target, "remote", "remove", "origin"], {
        stdio: "ignore",
      });

      const listResult = spawnSync("git", ["-C", source, "remote", "-v"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (listResult.status !== 0 || !listResult.stdout?.trim()) {
        logger.log("no remotes found in source (origin removed from clone)");
        return;
      }

      const lines = listResult.stdout.trim().split("\n");
      const remotes: Record<string, { fetch?: string; push?: string }> = {};

      for (const line of lines) {
        const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
        if (match) {
          const [, name, url, type] = match;
          if (!remotes[name]) {
            remotes[name] = {};
          }
          if (type === "fetch") {
            remotes[name].fetch = url;
          } else {
            remotes[name].push = url;
          }
        }
      }

      for (const [name, urls] of Object.entries(remotes)) {
        if (urls.fetch) {
          const addRes = spawnSync(
            "git",
            ["-C", target, "remote", "add", name, urls.fetch],
            { stdio: "ignore" },
          );
          if (addRes.status !== 0) {
            logger.log(`failed to add remote ${name} ${urls.fetch}`);
          }
        }
        if (urls.push && urls.push !== urls.fetch) {
          spawnSync(
            "git",
            ["-C", target, "remote", "set-url", "--push", name, urls.push],
            { stdio: "ignore" },
          );
        }
      }

      logger.log(`copied ${Object.keys(remotes).length} remotes`);
    } catch (err) {
      logger.log(`copy remotes error: ${err}`);
    }
  }

  function limaInstanceExists(name: string): boolean {
    try {
      const result = spawnSync("limactl", ["list", name], {
        stdio: "ignore",
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  logger.log("registering prompt");

  await ctx.session.hook("prompt", async (event) => {
    const session = await ctx.session.get({ sessionID: event.sessionID });
    const dir = session.location.directory;
    const gitEnabled = isGitEnabled(dir);
    logger.log(`session ${event.sessionID} prompt - gitEnabled: ${gitEnabled}`);

    const target = path.join(openpodRoot, event.sessionID);
    const needsMove = dir !== target;

    logger.log(
      `needs move for project dir ${dir}? ${needsMove} (target=${target})`,
    );

    if (!gitEnabled) {
      logger.log(`git is not enabled`);
      return;
    }

    const limaName = event.sessionID;
    const podDir = target;

    if (needsMove) {
      if (fs.existsSync(target)) {
        logger.log(`${target} already exists`);
        await ctx.session.move({
          sessionID: event.sessionID,
          directory: target,
        });
      } else {
        const repoRoot = getRepoRoot(dir);

        if (!repoRoot) {
          logger.log(`failed to get repo root`);
          return;
        }

        logger.log(`cloning ${repoRoot} -> ${target}`);
        fs.mkdirSync(openpodRoot, { recursive: true });

        cloneRepo(repoRoot, target);

        logger.log(`clone complete, moving session to ${target}`);
        await ctx.session.move({
          sessionID: event.sessionID,
          directory: target,
        });
      }
    } else {
      logger.log(`already in ${target} directory`);
    }

    // ensure lima instance for this pod
    if (!limaInstanceExists(limaName)) {
      logger.log(`creating lima instance ${limaName} (mount-only ${podDir}:w)`);
      const createResult = spawnSync(
        "limactl",
        [
          "create",
          `--name=${limaName}`,
          `--mount-only=${podDir}:w`,
          "template:default",
          "--yes",
        ],
        {
          stdio: "ignore",
        },
      );
      if (createResult.status !== 0) {
        logger.log(`limactl create exited with ${createResult.status}`);
      }
    }

    logger.log(`starting lima instance ${limaName}`);
    const startResult = spawnSync("limactl", ["start", limaName, "--yes"], {
      stdio: "ignore",
    });
    if (startResult.status !== 0) {
      logger.log(`limactl start exited with ${startResult.status}`);
    }
  });
}
