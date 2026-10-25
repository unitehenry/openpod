import { OpenCode } from "@opencode/sdk"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("opencode", () => {
  let opencode: Awaited<ReturnType<typeof OpenCode.create>>;

  beforeEach(async () => {
    opencode = await OpenCode.create();
  });

  afterEach(async () => {
    await opencode?.close?.();
  });

  it("Opencode plugin cant register without limactl", async () => {
    // TODO: temporarily unlink `limactl` from path
    // TODO: Call await opencode.plugin(plugin) to register another plugin after startup.
    console.log(opencode);
    // TODO: assert limactl error is thrown
    // TODO: cleanup finally - link `limactl` from path
  });
});
