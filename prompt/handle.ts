import type { OpenpodContext } from "../context";
import { mkdir, rm } from "node:fs/promises";
import * as path from "node:path";

import { exec } from "../context/exec";
import { exists } from "../context/fs";

export type HandleParams = {
  ctx: OpenpodContext;
  sessionId: string;
  dir: string;
  move: (sessionId: string, directory: string) => void;
};

export async function handle(params: HandleParams): Promise<void> {
  const { ctx: deps, sessionId, dir, move } = params;
  const { logger, openpodRoot } = deps;

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
    void logger.log(
      `creating lima instance ${sessionId} (mount-only ${target}:w)`,
    );
    const createResult = await exec("limactl", [
      "create",
      `--name=${sessionId}`,
      `--mount-only=${target}:w`,
      "template:default",
      "--yes",
    ]);
    if (createResult.status !== 0) {
      void logger.log(`limactl create exited with ${createResult.status}`);
    }
  }

  async function startLimaInstance(sessionId: string): Promise<void> {
    void logger.log(`starting lima instance ${sessionId}`);
    const startResult = await exec("limactl", ["start", sessionId, "--yes"]);
    if (startResult.status !== 0) {
      void logger.log(`limactl start exited with ${startResult.status}`);
    }
  }

  async function cloneProject(
    originUrl: string,
    target: string,
  ): Promise<boolean> {
    await mkdir(openpodRoot, { recursive: true });
    const result = await exec("git", ["clone", originUrl, target]);
    if (result.status !== 0) {
      void logger.log(`git clone failed with exit code ${result.status}`);
      try {
        await rm(target, { recursive: true, force: true });
      } catch {
        // ignore cleanup failure
      }
      return false;
    }
    return true;
  }

  const gitEnabled = await isGitEnabled(dir);
  void logger.log(`session ${sessionId} prompt - gitEnabled: ${gitEnabled}`);

  if (!gitEnabled) {
    void logger.log(`git is not enabled`);
    return;
  }

  const target = path.join(openpodRoot, sessionId);
  const needsMove = dir !== target;

  void logger.log(
    `needs move for project dir ${dir}? ${needsMove} (target=${target})`,
  );

  if (needsMove) {
    if (await exists(target)) {
      void logger.log(`${target} already exists`);
      move(sessionId, target);
    } else {
      const originUrl = await getOriginUrl(dir);
      if (!originUrl) {
        void logger.log(`no origin remote configured`);
        return;
      }

      void logger.log(`cloning from origin ${originUrl} -> ${target}`);
      if (!(await cloneProject(originUrl, target))) {
        return;
      }

      void logger.log(`clone complete, moving session to ${target}`);
      move(sessionId, target);
    }
  } else {
    void logger.log(`already in ${target} directory`);
  }

  if (!(await limaInstanceExists(sessionId))) {
    await createLimaInstance(sessionId, target);
  }

  await startLimaInstance(sessionId);
}
