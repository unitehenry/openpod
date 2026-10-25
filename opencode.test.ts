import { OpenCode } from "@opencode/sdk";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import openpod from "./index";

describe("opencode", () => {
  const openpodRoot = path.join(os.homedir(), ".local", "share", "openpod");

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

  it("not create openpod instance for uninitialized git repo", async () => {
    // Create a temp directory that is not a git repo
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openpod-e2e-"));

    // Register the plugin and create a session, then move it to the non-git directory
    await opencode.plugin(openpod);
    const session = await opencode.sessions.create();

    // Move the session to the non-git temp directory so the prompt hook
    // fires in a non-git context
    await opencode.sessions.move({
      sessionID: session.id,
      directory: tempDir,
    });

    // Wait for the move to take effect
    await new Promise((r) => setTimeout(r, 200));

    // Trigger a prompt via the session API to fire the prompt hook.
    await opencode.sessions.prompt({
      sessionID: session.id,
      text: "hello",
    });

    expect(fs.existsSync(path.join(openpodRoot, session.id))).toBe(false);

    // Verify no lima instance was created for this session
    const listOutput = execSync("limactl list", { encoding: "utf8" });
    expect(listOutput).not.toContain(session.id);

    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  });
});
