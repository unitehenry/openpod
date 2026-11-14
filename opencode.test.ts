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
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), "openpod-e2e-non-git-"),
    );

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
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), "openpod-e2e-no-origin-"),
    );
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
      const tempDir = await mkdtemp(
        path.join(os.tmpdir(), "openpod-e2e-happy-path-"),
      );
      const bareDir = await mkdtemp(
        path.join(os.tmpdir(), "openpod-bare-happy-path-"),
      );
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
    "should recreate lima instance when re-prompted after it is deleted",
    { timeout: 180_000 },
    async () => {
      // Create a temp git repo with a remote origin
      const tempDir = await mkdtemp(
        path.join(os.tmpdir(), "openpod-e2e-recreate-"),
      );
      const bareDir = await mkdtemp(
        path.join(os.tmpdir(), "openpod-bare-recreate-"),
      );
      execSync("git init --bare", { cwd: bareDir, stdio: "ignore" });
      execSync("git init", { cwd: tempDir, stdio: "ignore" });
      execSync(`git remote add origin ${bareDir}`, {
        cwd: tempDir,
        stdio: "ignore",
      });

      function limaInstanceExists(name: string): boolean {
        try {
          execSync(`limactl list ${name}`, { stdio: "ignore" });
          return true;
        } catch {
          return false;
        }
      }

      function limaInstanceStatus(name: string): string {
        try {
          return execSync(`limactl list ${name} --format '{{.Status}}'`, {
            encoding: "utf8",
          }).trim();
        } catch {
          return "";
        }
      }

      // The prompt hook creates and starts the lima instance synchronously,
      // but poll anyway so a slow boot doesn't flake the assertion.
      async function waitForRunningLima(name: string): Promise<string> {
        let status = "";
        for (let i = 0; i < 120; i++) {
          status = limaInstanceStatus(name);
          if (status === "Running") break;
          await new Promise((r) => setTimeout(r, 250));
        }
        return status;
      }

      const session = await opencode.sessions.create();
      const sessionDir = path.join(openpodRoot, session.id);

      await opencode.sessions.move({
        sessionID: session.id,
        directory: tempDir,
      });

      // Wait for the move to take effect
      await new Promise((r) => setTimeout(r, 200));

      // First prompt clones the project into the openpod directory and
      // creates + starts the lima instance.
      await opencode.sessions.prompt({
        sessionID: session.id,
        text: "hello",
      });

      // Verify the pod exists
      expect(fs.existsSync(sessionDir)).toBe(true);
      expect(limaInstanceExists(session.id)).toBe(true);
      expect(await waitForRunningLima(session.id)).toBe("Running");

      // Wait for the prompt hook's async session.move() to land the session
      // in the openpod directory before re-prompting.
      for (let i = 0; i < 50; i++) {
        const current = await opencode.sessions.get({ sessionID: session.id });
        if (current.location?.directory === sessionDir) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      // Delete the lima instance out from under the session, leaving the
      // cloned pod directory in place.
      execSync(`limactl delete --force ${session.id}`, { stdio: "ignore" });
      expect(limaInstanceExists(session.id)).toBe(false);

      // Re-prompt: the existing pod directory is reused and the lima
      // instance is recreated.
      await opencode.sessions.prompt({
        sessionID: session.id,
        text: "hello again",
      });

      // Verify the pod was restored
      expect(fs.existsSync(sessionDir)).toBe(true);
      expect(limaInstanceExists(session.id)).toBe(true);
      expect(await waitForRunningLima(session.id)).toBe("Running");

      // Clean up
      await cleanup(session.id, [sessionDir, tempDir, bareDir]);
    },
  );

  it(
    "should remove lima instance and openpod directory when the session is deleted",
    { timeout: 180_000 },
    async () => {
      // Create a temp git repo with a remote origin
      const tempDir = await mkdtemp(
        path.join(os.tmpdir(), "openpod-e2e-delete-"),
      );
      const bareDir = await mkdtemp(
        path.join(os.tmpdir(), "openpod-bare-delete-"),
      );
      execSync("git init --bare", { cwd: bareDir, stdio: "ignore" });
      execSync("git init", { cwd: tempDir, stdio: "ignore" });
      execSync(`git remote add origin ${bareDir}`, {
        cwd: tempDir,
        stdio: "ignore",
      });

      function limaInstanceExists(name: string): boolean {
        try {
          execSync(`limactl list ${name}`, { stdio: "ignore" });
          return true;
        } catch {
          return false;
        }
      }

      const session = await opencode.sessions.create();
      const sessionDir = path.join(openpodRoot, session.id);

      await opencode.sessions.move({
        sessionID: session.id,
        directory: tempDir,
      });

      // Wait for the move to take effect
      await new Promise((r) => setTimeout(r, 200));

      // Prompt so the handler clones the project and creates the lima instance
      await opencode.sessions.prompt({
        sessionID: session.id,
        text: "hello",
      });

      expect(fs.existsSync(sessionDir)).toBe(true);
      expect(limaInstanceExists(session.id)).toBe(true);

      // Wait for the prompt hook's async session.move() to land the session
      // in the openpod directory before deleting it.
      for (let i = 0; i < 50; i++) {
        const current = await opencode.sessions.get({ sessionID: session.id });
        if (current.location?.directory === sessionDir) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      // Delete the session. The plugin's session.deleted handler should clean
      // up the lima instance and the openpod directory.
      await opencode.sessions.remove({ sessionID: session.id });

      // Poll for pod removal with independent waits that run concurrently.
      async function waitForPodRemoval(): Promise<{
        limaRemoved: boolean;
        dirRemoved: boolean;
      }> {
        async function waitFor(condition: () => boolean): Promise<boolean> {
          for (let i = 0; i < 100; i++) {
            if (condition()) return true;
            await new Promise((r) => setTimeout(r, 100));
          }
          return condition();
        }

        const [limaRemoved, dirRemoved] = await Promise.all([
          waitFor(() => !limaInstanceExists(session.id)),
          waitFor(() => !fs.existsSync(sessionDir)),
        ]);
        return { limaRemoved, dirRemoved };
      }

      const { limaRemoved, dirRemoved } = await waitForPodRemoval();
      expect(limaRemoved).toBe(true);
      expect(dirRemoved).toBe(true);

      // Clean up
      await cleanup(session.id, [sessionDir, tempDir, bareDir]);
    },
  );

  it(
    "runs shell commands within the session lima instance",
    { timeout: 120_000 },
    async () => {
      // Create a temp git repo with a remote origin
      const tempDir = await mkdtemp(
        path.join(os.tmpdir(), "openpod-e2e-shell-"),
      );
      const bareDir = await mkdtemp(
        path.join(os.tmpdir(), "openpod-bare-shell-"),
      );
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

      // Wait for the prompt hook's async session.move() to land the session
      // in the openpod directory. The create.before hook only wraps the
      // command with `limactl shell` when cwd is inside openpodRoot.
      for (let i = 0; i < 50; i++) {
        const current = await opencode.sessions.get({ sessionID: session.id });
        if (current.location?.directory === sessionDir) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      // Call shell.create — this triggers ctx.shell.hook("create.before"),
      // which wraps the command with `limactl shell ... bash -c 'hostname'`
      // so it executes inside the session's lima VM.
      const shell = await opencode.shell.create({
        command: "hostname",
        cwd: sessionDir,
      });

      // Wait for the shell command to finish
      for (let i = 0; i < 60; i++) {
        const info = await opencode.shell.get({
          id: shell.data.id,
          location: shell.location,
        });
        if (info.data.status !== "running") break;
        await new Promise((r) => setTimeout(r, 250));
      }

      const output = await opencode.shell.output({
        id: shell.data.id,
        location: shell.location,
      });

      // hostname inside a lima VM is lima-<instance-name>, and lima replaces
      // underscores with hyphens because hostnames can't contain underscores.
      const expectedHost = session.id.replace(/_/g, "-");
      expect(output.data.output).toContain(expectedHost);

      // Clean up
      await cleanup(session.id, [sessionDir, tempDir, bareDir]);
    },
  );
});
