import * as os from "node:os";
import * as path from "node:path";

import { initLog, type Logger } from "./log";
import { isCommandAvailable } from "./command";
import { createCleanup } from "./cleanup";

export type OpenpodContext = {
  log: Logger;
  openpodRoot: string;
  cleanup: (sessionID: string) => Promise<void>;
};

export async function init(): Promise<OpenpodContext> {
  const openpodRoot = path.join(os.homedir(), ".local", "share", "openpod");

  const log = initLog(openpodRoot);
  const cleanup = createCleanup(openpodRoot, log);

  if (!isCommandAvailable("limactl")) {
    log(
      "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
      "error",
    );
    throw new Error(
      "`limactl` is not installed. Lima is required for openpod. See https://lima-vm.io/",
    );
  }

  return { log, openpodRoot, cleanup };
}
