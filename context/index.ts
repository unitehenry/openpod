import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";

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

  function isCommandAvailable(command: string): boolean {
    try {
      if (process.platform === "win32") {
        execSync(`where ${command}`, { stdio: "ignore" });
      } else {
        execSync(`command -v ${command}`, {
          stdio: "ignore",
          shell: "/bin/sh",
        });
      }
      return true;
    } catch {
      return false;
    }
  }

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
