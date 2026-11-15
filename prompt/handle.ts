import type { OpenpodContext } from "../context";
import { access, mkdir, rm } from "node:fs/promises";
import * as path from "node:path";

export type HandleParams = {
  ctx: OpenpodContext;
  sessionId: string;
  dir: string;
  move: (sessionId: string, directory: string) => void;
};

export async function handle(params: HandleParams): Promise<void> {
  const { ctx: deps, sessionId, dir, move } = params;
  const { logger, openpodRoot, exec } = deps;

  async function isGitEnabled(dir: string): Promise<boolean> {
    const result = await exec("git", [
      "-C",
      dir,
      "rev-parse",
      "--is-inside-work-tree",
    ]);
    return result.status === 0;
  }

  async function getOriginUrl(dir: string): Promise<string | null> {
    const result = await exec(
      "git",
      ["-C", dir, "remote", "get-url", "origin"],
      {
        encoding: "utf8",
      },
    );
    if (result.status !== 0 || !result.stdout.trim()) {
      return null;
    }
    return result.stdout.trim();
  }

  async function limaInstanceExists(name: string): Promise<boolean> {
    const result = await exec("limactl", ["list", name]);
    return result.status === 0;
  }

  async function createLimaInstance(
    sessionId: string,
    target: string,
  ): Promise<void> {
    logger.log(`creating lima instance ${sessionId} (mount-only ${target}:w)`);
    const createResult = await exec("limactl", [
      "create",
      `--name=${sessionId}`,
      `--mount-only=${target}:w`,
      "template:default",
      "--yes",
    ]);
    if (createResult.status !== 0) {
      logger.log(`limactl create exited with ${createResult.status}`);
    }
  }

  async function startLimaInstance(sessionId: string): Promise<void> {
    logger.log(`starting lima instance ${sessionId}`);
    const startResult = await exec("limactl", ["start", sessionId, "--yes"]);
    if (startResult.status !== 0) {
      logger.log(`limactl start exited with ${startResult.status}`);
    }
  }

  async function cloneProject(
    originUrl: string,
    target: string,
  ): Promise<boolean> {
    await mkdir(openpodRoot, { recursive: true });
    const result = await exec("git", ["clone", originUrl, target]);
    if (result.status !== 0) {
      logger.log(`git clone failed with exit code ${result.status}`);
      try {
        await rm(target, { recursive: true, force: true });
      } catch {
        // ignore cleanup failure
      }
      return false;
    }
    return true;
  }

  async function hasTarget(target: string): Promise<boolean> {
    try {
      await access(target);
      return true;
    } catch {
      return false;
    }
  }

  const gitEnabled = await isGitEnabled(dir);
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
    const targetExists = await hasTarget(target);

    if (targetExists) {
      logger.log(`${target} already exists`);
      move(sessionId, target);
    } else {
      const originUrl = await getOriginUrl(dir);
      if (!originUrl) {
        logger.log(`no origin remote configured`);
        return;
      }

      logger.log(`cloning from origin ${originUrl} -> ${target}`);
      if (!(await cloneProject(originUrl, target))) {
        return;
      }

      logger.log(`clone complete, moving session to ${target}`);
      move(sessionId, target);
    }
  } else {
    logger.log(`already in ${target} directory`);
  }

  if (!(await limaInstanceExists(sessionId))) {
    await createLimaInstance(sessionId, target);
  }

  await startLimaInstance(sessionId);
}
