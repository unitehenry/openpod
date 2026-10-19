import { Plugin } from "@opencode/plugin";
import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const openpodRoot = path.join(os.homedir(), ".local", "share", "openpod");
const logDir = path.join(openpodRoot, ".log");
const logFile = path.join(logDir, "openpod.log");

function writeLog(message: string): void {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const timestamp = new Date().toISOString();
    fs.appendFileSync(
      logFile,
      `[${timestamp}] [openpod] ${message}
`,
    );
  } catch {
    // ignore logging failures
  }
}

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

export default Plugin.define({
  id: "openpod",
  async setup(ctx) {
    if (!isCommandAvailable("limactl")) {
      throw new Error(
        "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
      );
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

    writeLog("registering create.before");

    await ctx.shell.hook("create.before", async (event) => {
      const limaName = getLimaName(event.cwd);

      if (limaName) {
        const originalCommand = event.command;
        const escapedCwd = event.cwd.replace(/'/g, "'\''");
        const escapedCmd = originalCommand.replace(/'/g, "'\''");
        event.command = `limactl shell --preserve-env --workdir='${escapedCwd}' ${limaName} bash -c '${escapedCmd}'`;
        writeLog(
          `redirected shell command for lima ${limaName} (cwd=${event.cwd})`,
        );
      }
    });

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
  },
});
