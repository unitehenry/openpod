import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export async function registerPrompt(
  ctx: any,
  deps: { writeLog: (message: string) => void; openpodRoot: string },
): Promise<void> {
  const { writeLog, openpodRoot } = deps;

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
      writeLog(`failed to determine git root for ${dir}: ${err}`);
      return null;
    }
  }

  function cloneRepo(source: string, target: string): void {
    try {
      writeLog(`cloning ${source} -> ${target}`);
      const result = spawnSync("git", ["clone", source, target]);
      if (result.status !== 0) {
        throw new Error(`git clone failed with exit code ${result.status}`);
      }
      copyRemotes(source, target);
    } catch (err) {
      writeLog(`${err}`);
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch {}
    }
  }

  function copyRemotes(source: string, target: string): void {
    try {
      writeLog(`copying remotes from ${source} to ${target}`);

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
        writeLog("no remotes found in source (origin removed from clone)");
        return;
      }

      const lines = listResult.stdout.trim().split("
");
      const remotes: Record<string, { fetch?: string; push?: string }> = {};

      for (const line of lines) {
        const match = line.match(/^(S+)s+(S+)s+((fetch|push))$/);
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
            writeLog(`failed to add remote ${name} ${urls.fetch}`);
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

      writeLog(`copied ${Object.keys(remotes).length} remotes`);
    } catch (err) {
      writeLog(`copy remotes error: ${err}`);
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

  writeLog("registering prompt");

  await ctx.session.hook("prompt", async (event) => {
    const session = await ctx.session.get({ sessionID: event.sessionID });
    const dir = session.location.directory;
    const gitEnabled = isGitEnabled(dir);
    writeLog(`session ${event.sessionID} prompt - gitEnabled: ${gitEnabled}`);

    const target = path.join(openpodRoot, event.sessionID);
    const needsMove = dir !== target;

    writeLog(
      `needs move for project dir ${dir}? ${needsMove} (target=${target})`,
    );

    if (!gitEnabled) {
      writeLog(`git is not enabled`);
      return;
    }

    const limaName = event.sessionID;
    const podDir = target;

    if (needsMove) {
      if (fs.existsSync(target)) {
        writeLog(`${target} already exists`);
        await ctx.session.move({
          sessionID: event.sessionID,
          directory: target,
        });
      } else {
        const repoRoot = getRepoRoot(dir);

        if (!repoRoot) {
          writeLog(`failed to get repo root`);
          return;
        }

        writeLog(`cloning ${repoRoot} -> ${target}`);
        fs.mkdirSync(openpodRoot, { recursive: true });

        cloneRepo(repoRoot, target);

        writeLog(`clone complete, moving session to ${target}`);
        await ctx.session.move({
          sessionID: event.sessionID,
          directory: target,
        });
      }
    } else {
      writeLog(`already in ${target} directory`);
    }

    // ensure lima instance for this pod
    if (!limaInstanceExists(limaName)) {
      writeLog(`creating lima instance ${limaName} (mount-only ${podDir}:w)`);
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
        writeLog(`limactl create exited with ${createResult.status}`);
      }
    }

    writeLog(`starting lima instance ${limaName}`);
    const startResult = spawnSync("limactl", ["start", limaName, "--yes"], {
      stdio: "ignore",
    });
    if (startResult.status !== 0) {
      writeLog(`limactl start exited with ${startResult.status}`);
    }
  });
}
