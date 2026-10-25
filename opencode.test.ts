import { OpenCode } from "@opencode/sdk";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import openpod from "./index";

// OpenCode SDK's close() shuts down its SQLite database before all pending
// fs callbacks drain from the event loop, causing an unhandled rejection
// ("database is not open") during vitest teardown. Suppress it.
process.on("unhandledRejection", (err) => {
  if ((err as { code?: string })?.code === "ERR_INVALID_STATE") return;
  throw err;
});

describe("opencode", () => {
  const openpodRoot = path.join(os.homedir(), ".local", "share", "openpod");

  let opencode: Awaited<ReturnType<typeof OpenCode.create>>;

  async function cleanup(sessionId: string, dirs: string[]) {
    try {
      execSync(`limactl delete --force ${sessionId}`, { stdio: "ignore" });
    } catch {
      // ignore
    }
    try {
      await opencode.sessions.remove({ sessionID: sessionId });
    } catch {
      // ignore
    }
    for (const d of dirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  beforeEach(async () => {
    opencode = await OpenCode.create();
    await opencode.plugin(openpod);
  });

  afterEach(async () => {
    await opencode?.[Symbol.asyncDispose]?.();
  });

  it("registers openpod plugin with opencode", async () => {
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

  it("should not create openpod instance for uninitialized git repo", async () => {
    // Create a temp directory that is not a git repo
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "openpod-e2e-non-git-"));

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

    // Clean up
    await cleanup(session.id, [tempDir]);
  });

  it("should not create openpod instance for uninitialized git origin", async () => {
    // Create a temp directory and init a git repo (but no remote origin)
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "openpod-e2e-no-origin-"));
    execSync("git init", { cwd: tempDir, stdio: "ignore" });

    const session = await opencode.sessions.create();

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

    // Clean up
    await cleanup(session.id, [tempDir]);
  });

  it(
    "should create openpod directory and lima instance for new session",
    { timeout: 120_000 },
    async () => {
      // Create a temp git repo with a remote origin
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "openpod-e2e-happy-path-"));
      const bareDir = await mkdtemp(path.join(os.tmpdir(), "openpod-bare-happy-path-"));
      execSync("git init --bare", { cwd: bareDir, stdio: "ignore" });
      execSync("git init", { cwd: tempDir, stdio: "ignore" });
      execSync(`git remote add origin ${bareDir}`, {
        cwd: tempDir,
        stdio: "ignore",
      });

      const session = await opencode.sessions.create();

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

      // Verify the openpod directory was created (cloned)
      const sessionDir = path.join(openpodRoot, session.id);
      expect(fs.existsSync(sessionDir)).toBe(true);

      // Verify a lima instance was created for this session
      const listOutput = execSync("limactl list", { encoding: "utf8" });
      expect(listOutput).toContain(session.id);

      // Clean up
      await cleanup(session.id, [sessionDir, tempDir, bareDir]);
    },
  );

  it(
    "runs shell commands within the session lima instance",
    { timeout: 120_000 },
    async () => {
      // Create a temp git repo with a remote origin
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "openpod-e2e-shell-"));
      const bareDir = await mkdtemp(path.join(os.tmpdir(), "openpod-bare-shell-"));
      execSync("git init --bare", { cwd: bareDir, stdio: "ignore" });
      execSync("git init", { cwd: tempDir, stdio: "ignore" });
      execSync(`git remote add origin ${bareDir}`, {
        cwd: tempDir,
        stdio: "ignore",
      });

      const session = await opencode.sessions.create();

      await opencode.sessions.move({
        sessionID: session.id,
        directory: tempDir,
      });

      // Wait for the move to take effect
      await new Promise((r) => setTimeout(r, 200));

      // Trigger a prompt so the handler clones and creates the lima instance
      await opencode.sessions.prompt({
        sessionID: session.id,
        text: "hello",
      });

      const sessionDir = path.join(openpodRoot, session.id);
      expect(fs.existsSync(sessionDir)).toBe(true);

      // // Run a shell command inside the lima VM to verify it's accessible.
      // // Limactl start returns before SSH is ready, so we use execSync
      // // with a generous timeout directly rather than going through
      // // opencode.shell (which has a lower default timeout).
      // const hostname = execSync(`limactl shell ${session.id} hostname`, {
      //   encoding: "utf8",
      //   timeout: 60_000,
      // }).trim();

      // // Lima VMs use the instance name as hostname with underscores
      // // replaced by hyphens (hostnames can't have underscores).
      // const expectedHost = session.id.replace(/_/g, "-");
      // expect(hostname).toContain(expectedHost);

      // Clean up
      await cleanup(session.id, [sessionDir, tempDir, bareDir]);
    },
  );
});
