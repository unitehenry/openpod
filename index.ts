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
    fs.appendFileSync(logFile, `[${timestamp}] [openpod] ${message}\n`);
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
    const result = spawnSync("git", ["clone", source, target], {
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(`git clone failed with exit code ${result.status}`);
    }
  } catch (err) {
    writeLog(`${err}`);
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch {}
  }
}

function getLimaName(dir: string): string | null {
  try {
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
            stdio: "inherit",
          },
        );
        if (createResult.status !== 0) {
          writeLog(`limactl create exited with ${createResult.status}`);
        }
      }

      writeLog(`starting lima instance ${limaName}`);
      const startResult = spawnSync("limactl", ["start", limaName, "--yes"], {
        stdio: "inherit",
      });
      if (startResult.status !== 0) {
        writeLog(`limactl start exited with ${startResult.status}`);
      }
    });

    await ctx.shell.hook("create.before", async (event) => {
      const limaName = getLimaName(event.cwd);
      if (limaName) {
        const originalCommand = event.command;
        const escapedCwd = event.cwd.replace(/'/g, "'\\''");
        const escapedCmd = originalCommand.replace(/'/g, "'\\''");
        event.command = `limactl shell --preserve-env --workdir='${escapedCwd}' ${limaName} bash -c '${escapedCmd}'`;
        writeLog(
          `redirected shell command for lima ${limaName} (cwd=${event.cwd})`,
        );
      }
    });
  },
});
