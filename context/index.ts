import * as os from "node:os";
import * as path from "node:path";

import { initLogger, type Logger } from "./log";
import { isCommandAvailable } from "./command";
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

  if (!isCommandAvailable("limactl")) {
    logger.log(
      "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
      "error",
    );
    throw new Error(
      "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
    );
  }

  return { logger, openpodRoot, cleanup };
}
