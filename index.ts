import { Plugin } from "@opencode/plugin";

import { registerPrompt } from "./prompt";
import { registerShell } from "./shell";
import { registerController } from "./controller";
import { registerSetup } from "./setup";

export default Plugin.define({
  id: "openpod",
  async setup(ctx) {
    const openpod = await registerSetup();

    await registerPrompt(ctx, openpod);
    await registerShell(ctx, openpod);

    return await registerController(ctx, openpod);
  },
});
