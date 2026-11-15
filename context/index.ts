import * as os from "node:os";
import * as path from "node:path";

import { exec } from "./exec";
import { initLogger, type Logger } from "./logger";
import { initCleanup, type Cleanup } from "./cleanup";

export type OpenpodContext = {
  logger: Logger;
  openpodRoot: string;
  cleanup: Cleanup;
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

  if (!(await isCommandAvailable("limactl"))) {
    void logger.log(
      "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
      "error",
    );
    throw new Error(
      "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
    );
  }

  return { logger, openpodRoot, cleanup };
}
