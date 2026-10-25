import { Plugin } from "@opencode/plugin";

import { registerCommand } from "./command";
import { registerPrompt } from "./prompt";
import { registerShell } from "./shell";
import { registerController } from "./controller";
import { init } from "./context";

const PLUGIN_ID = "openpod";

export default Plugin.define({
  id: PLUGIN_ID,
  async setup(ctx) {
    const openpod = await init();

    await registerPrompt(ctx, openpod);
    await registerShell(ctx, openpod);
    await registerCommand(ctx, openpod);

    return registerController(ctx, openpod);
  },
});
