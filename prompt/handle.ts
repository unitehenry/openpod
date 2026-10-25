import type { OpenpodContext } from "../context";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

type HandleParams = {
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
        stdio: "ignore",
      },
    );
    if (createResult.status !== 0) {
      logger.log(`limactl create exited with ${createResult.status}`);
    }
  }

  function startLimaInstance(sessionId: string): void {
    logger.log(`starting lima instance ${sessionId}`);
    const startResult = spawnSync("limactl", ["start", sessionId, "--yes"], {
      stdio: "ignore",
    });
    if (startResult.status !== 0) {
      logger.log(`limactl start exited with ${startResult.status}`);
    }
  }

  function cloneProject(originUrl: string, target: string): boolean {
    fs.mkdirSync(openpodRoot, { recursive: true });
    const result = spawnSync("git", ["clone", originUrl, target]);
    if (result.status !== 0) {
      logger.log(`git clone failed with exit code ${result.status}`);
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

export type { HandleParams };
