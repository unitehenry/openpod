import * as os from "node:os";
import * as path from "node:path";

import { exec } from "./exec";
import { initLogger, type Logger } from "./logger";
import { initCleanup, type Cleanup } from "./cleanup";

const LIMA_URL = "https://lima-vm.io/";
const LIMA_MISSING_MESSAGE = `\`limactl\` is not installed. Lima is required for openpod. See ${LIMA_URL}`;

export type OpenpodContext = {
  logger: Logger;
  openpodRoot: string;
  cleanup: Cleanup;
  exec: typeof exec;
};

export async function init(): Promise<OpenpodContext> {
  const openpodRoot = path.join(os.homedir(), ".local", "share", "openpod");

  const logger = initLogger(openpodRoot);
  const cleanup = initCleanup(openpodRoot, logger);

  async function isCommandAvailable(command: string): Promise<boolean> {
    const result =
      process.platform === "win32"
        ? await exec("where", [command])
        : await exec("/bin/sh", ["-c", `command -v ${command}`]);
    return result.status === 0;
  }

  const isLimaInstalled = await isCommandAvailable("limactl");
  if (!isLimaInstalled) {
    logger.log(LIMA_MISSING_MESSAGE, "error");
    throw new Error(LIMA_MISSING_MESSAGE);
  }

  return { logger, openpodRoot, cleanup, exec };
}
