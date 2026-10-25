import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

import type { OpenpodContext } from "../context";
import { handle } from "./handle";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: vi.fn(),
  };
});

describe("handle", () => {
  let tempRoot: string;
  let mockLogger: { log: ReturnType<typeof vi.fn> };
  let mockMove: ReturnType<typeof vi.fn>;
  let ctx: OpenpodContext;

  beforeEach(() => {
    vi.clearAllMocks();
    (
      spawnSync as unknown as { mockReturnValue: (val: unknown) => void }
    ).mockReturnValue({
      status: 0,
    });
    tempRoot = path.join(
      os.tmpdir(),
      `openpod-test-${Date.now()}-${Math.random()}`,
    );
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(tempRoot, { recursive: true });

    mockLogger = { log: vi.fn() };
    mockMove = vi.fn();
    ctx = {
      logger: mockLogger,
      openpodRoot: tempRoot,
      cleanup: { execute: vi.fn() } as unknown as OpenpodContext["cleanup"],
    };
  });

  afterEach(() => {
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("returns a handle function that can be called", () => {
    // just ensure no throw on basic call
    handle({
      ctx,
      sessionId: "test",
      dir: "/tmp/some",
      move: mockMove,
    });
    expect(mockLogger.log).toHaveBeenCalled();
  });

  it("returns early if not git enabled", () => {
    (
      spawnSync as unknown as { mockReturnValue: (val: unknown) => void }
    ).mockReturnValue({ status: 1 });

    handle({
      ctx,
      sessionId: "sess1",
      dir: "/project/dir",
      move: mockMove,
    });

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining("git is not enabled"),
    );
    expect(mockMove).not.toHaveBeenCalled();
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["-C", "/project/dir", "rev-parse", "--is-inside-work-tree"],
      { stdio: "ignore" },
    );
  });

  it("returns early for invalid git (no origin)", () => {
    (
      spawnSync as unknown as {
        mockReturnValueOnce: (val: unknown) => typeof spawnSync;
      }
    )
      .mockReturnValueOnce({ status: 0 }) // isGitEnabled
      .mockReturnValueOnce({ status: 1, stdout: "" }); // getOriginUrl

    const dir = "/project/dir";
    handle({ ctx, sessionId: "sess1", dir, move: mockMove });

    expect(mockLogger.log).toHaveBeenCalledWith("no origin remote configured");
    expect(mockMove).not.toHaveBeenCalled();
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["-C", dir, "remote", "get-url", "origin"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  });

  it("clones project and moves when needs move and target does not exist", () => {
    const sessionId = "clone-sess";
    const dir = "/real/project";
    const target = path.join(tempRoot, sessionId);
    const origin = "https://example.com/repo.git";

    (
      spawnSync as unknown as {
        mockReturnValueOnce: (val: unknown) => typeof spawnSync;
      }
    )
      .mockReturnValueOnce({ status: 0 }) // isGit
      .mockReturnValueOnce({ status: 0, stdout: origin + "\n" }) // getOrigin
      .mockReturnValueOnce({ status: 0 }) // clone git
      .mockReturnValueOnce({ status: 1 }) // lima list (not exists)
      .mockReturnValueOnce({ status: 0 }) // create lima
      .mockReturnValueOnce({ status: 0 }); // start lima

    handle({ ctx, sessionId, dir, move: mockMove });

    expect(spawnSync).toHaveBeenCalledWith("git", ["clone", origin, target]);
    expect(mockMove).toHaveBeenCalledWith(sessionId, target);
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining("cloning from origin"),
    );
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining("clone complete, moving"),
    );

    // lima create called
    expect(spawnSync).toHaveBeenCalledWith(
      "limactl",
      [
        "create",
        `--name=${sessionId}`,
        `--mount-only=${target}:w`,
        "template:default",
        "--yes",
      ],
      { stdio: "ignore" },
    );
    // start
    expect(spawnSync).toHaveBeenCalledWith(
      "limactl",
      ["start", sessionId, "--yes"],
      { stdio: "ignore" },
    );
  });

  it("moves session when target already exists (no clone)", () => {
    const sessionId = "existing";
    const dir = "/other/location";
    const target = path.join(tempRoot, sessionId);
    fs.mkdirSync(target, { recursive: true });

    (
      spawnSync as unknown as {
        mockReturnValueOnce: (val: unknown) => typeof spawnSync;
      }
    )
      .mockReturnValueOnce({ status: 0 }) // is git
      .mockReturnValueOnce({ status: 1 }) // lima not
      .mockReturnValueOnce({ status: 0 }) // create
      .mockReturnValueOnce({ status: 0 }); // start

    handle({ ctx, sessionId, dir, move: mockMove });

    expect(mockMove).toHaveBeenCalledWith(sessionId, target);
    expect(spawnSync).not.toHaveBeenCalledWith("git", [
      "clone",
      expect.anything(),
      expect.anything(),
    ]);
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
  });

  it("does not move when already at target dir", () => {
    const sessionId = "same";
    const target = path.join(tempRoot, sessionId);
    fs.mkdirSync(target, { recursive: true });

    (
      spawnSync as unknown as {
        mockReturnValueOnce: (val: unknown) => typeof spawnSync;
      }
    )
      .mockReturnValueOnce({ status: 0 }) // git
      .mockReturnValueOnce({ status: 1 }) // lima not exist
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0 });

    handle({ ctx, sessionId, dir: target, move: mockMove });

    expect(mockMove).not.toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining("already in"),
    );
  });

  it("skips create if lima instance already exists", () => {
    const sessionId = "has-lima";
    const dir = path.join(tempRoot, sessionId);
    fs.mkdirSync(dir, { recursive: true });

    (
      spawnSync as unknown as {
        mockReturnValueOnce: (val: unknown) => typeof spawnSync;
      }
    )
      .mockReturnValueOnce({ status: 0 }) // git
      .mockReturnValueOnce({ status: 0 }) // lima exists (list status 0)
      .mockReturnValueOnce({ status: 0 }); // start only

    handle({ ctx, sessionId, dir, move: mockMove });

    expect(spawnSync).not.toHaveBeenCalledWith(
      "limactl",
      expect.arrayContaining(["create"]),
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "limactl",
      ["start", sessionId, "--yes"],
      { stdio: "ignore" },
    );
  });

  it("logs create failure but continues to start", () => {
    const sessionId = "fail-create";
    const dir = "/proj";

    (
      spawnSync as unknown as {
        mockReturnValueOnce: (val: unknown) => typeof spawnSync;
      }
    )
      .mockReturnValueOnce({ status: 0 }) // git
      .mockReturnValueOnce({ status: 0, stdout: "url\n" }) // origin
      .mockReturnValueOnce({ status: 0 }) // clone
      .mockReturnValueOnce({ status: 1 }) // lima not
      .mockReturnValueOnce({ status: 42 }) // create fails
      .mockReturnValueOnce({ status: 0 }); // start succeeds

    handle({ ctx, sessionId, dir, move: mockMove });

    expect(mockLogger.log).toHaveBeenCalledWith(
      "limactl create exited with 42",
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "limactl",
      ["start", sessionId, "--yes"],
      { stdio: "ignore" },
    );
  });

  it("logs start failure (does not throw)", () => {
    const sessionId = "fail-start";
    const dir = path.join(tempRoot, sessionId);
    fs.mkdirSync(dir, { recursive: true });

    (
      spawnSync as unknown as {
        mockReturnValueOnce: (val: unknown) => typeof spawnSync;
      }
    )
      .mockReturnValueOnce({ status: 0 }) // git
      .mockReturnValueOnce({ status: 0 }) // lima exists
      .mockReturnValueOnce({ status: 1 }); // start fails

    handle({ ctx, sessionId, dir, move: mockMove });

    expect(mockLogger.log).toHaveBeenCalledWith("limactl start exited with 1");
  });

  it("logs git clone failure and does not move", () => {
    const sessionId = "clone-fail";
    const dir = "/proj";
    const origin = "https://bad";

    (
      spawnSync as unknown as {
        mockReturnValueOnce: (val: unknown) => typeof spawnSync;
      }
    )
      .mockReturnValueOnce({ status: 0 }) // git
      .mockReturnValueOnce({ status: 0, stdout: origin + "\n" })
      .mockReturnValueOnce({ status: 1 }); // clone fails -- no more calls

    handle({ ctx, sessionId, dir, move: mockMove });

    expect(mockLogger.log).toHaveBeenCalledWith(
      "git clone failed with exit code 1",
    );
    expect(mockMove).not.toHaveBeenCalled();
    // no lima/start since returned early
    expect(spawnSync).not.toHaveBeenCalledWith(
      expect.stringContaining("limactl"),
      expect.any(Array),
      expect.any(Object),
    );
  });
});
