import type { OpenpodContext } from "../context";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Log a failed spawn with its captured stderr/stdout. The openpod log file is
 * not collected on CI runners, so also write the message to stderr where the
 * CI job output can see it.
 */
function logFailure(
  logger: OpenpodContext["logger"],
  label: string,
  result: ReturnType<typeof spawnSync>,
): void {
  if (result.status === 0) return;

  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  const message = [
    `${label} exited with ${result.status}`,
    result.error ? `error: ${result.error.message}` : "",
    stderr ? `stderr:\n${stderr}` : "",
    stdout ? `stdout:\n${stdout}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  logger.log(message, "error");
  console.error(`[openpod] ${message}`);
}

/**
 * When `limactl start` fails, its own stderr usually only contains the
 * hostagent summary. The actual QEMU error is written to ha.stderr.log.
 */
function logLimaHostagentLog(
  logger: OpenpodContext["logger"],
  sessionId: string,
): void {
  const instanceDir = path.join(os.homedir(), ".lima", sessionId);
  const filePath = path.join(instanceDir, "ha.stderr.log");
  try {
    if (!fs.existsSync(filePath)) return;
    const contents = fs.readFileSync(filePath, "utf8").trim();
    if (!contents) return;
    const message = `ha.stderr.log:\n${contents}`;
    logger.log(message, "error");
    console.error(`[openpod] ${message}`);
  } catch (err) {
    logger.log(`failed to read ${filePath}: ${err}`, "error");
  }
}

export type HandleParams = {
  ctx: OpenpodContext;
  sessionId: string;
  dir: string;
  move: (sessionId: string, directory: string) => void;
};

export function handle(params: HandleParams): void {
  const { ctx: deps, sessionId, dir, move } = params;
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

  function getOriginUrl(dir: string): string | null {
    try {
      const result = spawnSync(
        "git",
        ["-C", dir, "remote", "get-url", "origin"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
      if (result.status !== 0 || !result.stdout?.trim()) {
        return null;
      }
      return result.stdout.trim();
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

  function createLimaInstance(sessionId: string, target: string): void {
    logger.log(`creating lima instance ${sessionId} (mount-only ${target}:w)`);
    const createResult = spawnSync(
      "limactl",
      [
        "create",
        `--name=${sessionId}`,
        `--mount-only=${target}:w`,
        "template:default",
        "--yes",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    logFailure(logger, `limactl create ${sessionId}`, createResult);
  }

  function startLimaInstance(sessionId: string): void {
    logger.log(`starting lima instance ${sessionId}`);
    const startResult = spawnSync("limactl", ["start", sessionId, "--yes"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    logFailure(logger, `limactl start ${sessionId}`, startResult);
    if (startResult.status !== 0) {
      logLimaHostagentLog(logger, sessionId);
      if (process.platform === "linux") {
        const kvmMessage = `/dev/kvm exists: ${fs.existsSync("/dev/kvm")}`;
        logger.log(kvmMessage, "error");
        console.error(`[openpod] ${kvmMessage}`);
      }
    }
  }

  function cloneProject(originUrl: string, target: string): boolean {
    fs.mkdirSync(openpodRoot, { recursive: true });
    const result = spawnSync("git", ["clone", originUrl, target]);
    if (result.status !== 0) {
      const stderr = result.stderr?.toString().trim();
      const message = [
        `git clone failed with exit code ${result.status}`,
        stderr ? `stderr:\n${stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      logger.log(message, "error");
      console.error(`[openpod] ${message}`);
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch {
        // ignore cleanup failure
      }
      return false;
    }
    return true;
  }

  const gitEnabled = isGitEnabled(dir);
  logger.log(`session ${sessionId} prompt - gitEnabled: ${gitEnabled}`);

  if (!gitEnabled) {
    logger.log(`git is not enabled`);
    return;
  }

  const target = path.join(openpodRoot, sessionId);
  const needsMove = dir !== target;

  logger.log(
    `needs move for project dir ${dir}? ${needsMove} (target=${target})`,
  );

  if (needsMove) {
    if (fs.existsSync(target)) {
      logger.log(`${target} already exists`);
      move(sessionId, target);
    } else {
      const originUrl = getOriginUrl(dir);
      if (!originUrl) {
        logger.log(`no origin remote configured`);
        return;
      }

      logger.log(`cloning from origin ${originUrl} -> ${target}`);
      if (!cloneProject(originUrl, target)) {
        return;
      }

      logger.log(`clone complete, moving session to ${target}`);
      move(sessionId, target);
    }
  } else {
    logger.log(`already in ${target} directory`);
  }

  if (!limaInstanceExists(sessionId)) {
    createLimaInstance(sessionId, target);
  }

  startLimaInstance(sessionId);
}
