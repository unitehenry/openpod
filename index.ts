import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "openpod",
  async setup(ctx) {
    await ctx.storage.set("loaded", true)
  },
})
