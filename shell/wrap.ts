import type { OpenpodContext } from "../context";
import * as path from "node:path";

export async function wrap(
  deps: OpenpodContext,
  cwd: string,
  command: string,
): Promise<string> {
  async function getLimaName(dir: string): Promise<string | null> {
    const { logger, openpodRoot } = deps;
    try {
      await logger.log(`get lima name for ${openpodRoot} ${dir}`);
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

  const limaName = await getLimaName(cwd);
  if (!limaName) {
    return command;
  }

  const escapedCwd = cwd.replace(/'/g, "'\\''");
  const escapedCmd = command.replace(/'/g, "'\\''");
  const wrapped = `limactl shell --preserve-env --workdir='${escapedCwd}' ${limaName} bash -c '${escapedCmd}'`;

  await deps.logger.log(
    `redirected shell command for lima ${limaName} (cwd=${cwd})`,
  );

  return wrapped;
}
