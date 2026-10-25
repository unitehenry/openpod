import { OpenCode } from "@opencode/sdk";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import openpod from "./index";

describe("opencode", () => {
  let opencode: Awaited<ReturnType<typeof OpenCode.create>>;

  beforeEach(async () => {
    opencode = await OpenCode.create();
  });

  afterEach(async () => {
    await opencode?.close?.();
  });

  it("registers openpod plugin with opencode", async () => {
    await opencode.plugin(openpod);

    await opencode.sessions.create();

    let commands: Awaited<ReturnType<typeof opencode.command.list>> | undefined;

    for (let i = 0; i < 20; i++) {
      commands = await opencode.command.list();
      if (
        commands.data.some((c: { name: string }) => c.name === "clear-openpod")
      )
        break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(
      commands!.data.some((c: { name: string }) => c.name === "clear-openpod"),
    ).toBe(true);
  });
});
