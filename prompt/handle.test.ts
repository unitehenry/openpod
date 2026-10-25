import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

import type { OpenpodContext } from "../context";
import { init } from "../context";
import { handle } from "./handle";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: vi.fn(),
  };
});

describe("handle", () => {
  let mockMove: ReturnType<
    typeof vi.fn<(sessionId: string, directory: string) => void>
  >;
  let spawn: ReturnType<typeof vi.fn>;
  let ctx: OpenpodContext;
  let baseCtx: OpenpodContext;

  beforeAll(async () => {
    baseCtx = await init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    spawn = spawnSync as unknown as ReturnType<typeof vi.fn>;
    spawn.mockReturnValue({
      status: 0,
    });

    const tempRoot = path.join(
      os.tmpdir(),
      `openpod-test-${Date.now()}-${Math.random()}`,
    );
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(tempRoot, { recursive: true });

    ctx = {
      ...baseCtx,
      openpodRoot: tempRoot,
    };
    ctx.cleanup.execute = vi.fn();
    mockMove = vi.fn();
  });

  afterEach(() => {
    if (fs.existsSync(ctx.openpodRoot)) {
      fs.rmSync(ctx.openpodRoot, { recursive: true, force: true });
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
  });

  it("returns early if not git enabled", () => {
    spawn.mockReturnValue({ status: 1 });

    handle({
      ctx,
      sessionId: "sess1",
      dir: "/project/dir",
      move: mockMove,
    });

    expect(mockMove).not.toHaveBeenCalled();
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["-C", "/project/dir", "rev-parse", "--is-inside-work-tree"],
      { stdio: "ignore" },
    );
  });

  it("returns early for invalid git (no origin)", () => {
    spawn
      .mockReturnValueOnce({ status: 0 }) // isGitEnabled
      .mockReturnValueOnce({ status: 1, stdout: "" }); // getOriginUrl

    const dir = "/project/dir";
    handle({ ctx, sessionId: "sess1", dir, move: mockMove });

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
    const target = path.join(ctx.openpodRoot, sessionId);
    const origin = "https://example.com/repo.git";

    spawn
      .mockReturnValueOnce({ status: 0 }) // isGit
      .mockReturnValueOnce({ status: 0, stdout: origin + "\n" }) // getOrigin
      .mockReturnValueOnce({ status: 0 }) // clone git
      .mockReturnValueOnce({ status: 1 }) // lima list (not exists)
      .mockReturnValueOnce({ status: 0 }) // create lima
      .mockReturnValueOnce({ status: 0 }); // start lima

    handle({ ctx, sessionId, dir, move: mockMove });

    expect(spawnSync).toHaveBeenCalledWith("git", ["clone", origin, target]);
    expect(mockMove).toHaveBeenCalledWith(sessionId, target);

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
    const target = path.join(ctx.openpodRoot, sessionId);
    fs.mkdirSync(target, { recursive: true });

    spawn
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
  });

  it("does not move when already at target dir", () => {
    const sessionId = "same";
    const target = path.join(ctx.openpodRoot, sessionId);
    fs.mkdirSync(target, { recursive: true });

    spawn
      .mockReturnValueOnce({ status: 0 }) // git
      .mockReturnValueOnce({ status: 1 }) // lima not exist
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0 });

    handle({ ctx, sessionId, dir: target, move: mockMove });

    expect(mockMove).not.toHaveBeenCalled();
  });

  it("skips create if lima instance already exists", () => {
    const sessionId = "has-lima";
    const dir = path.join(ctx.openpodRoot, sessionId);
    fs.mkdirSync(dir, { recursive: true });

    spawn
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

  it("handles lima create failure but continues to start", () => {
    const sessionId = "fail-create";
    const dir = "/proj";

    spawn
      .mockReturnValueOnce({ status: 0 }) // git
      .mockReturnValueOnce({ status: 0, stdout: "url\n" }) // origin
      .mockReturnValueOnce({ status: 0 }) // clone
      .mockReturnValueOnce({ status: 1 }) // lima not
      .mockReturnValueOnce({ status: 42 }) // create fails
      .mockReturnValueOnce({ status: 0 }); // start succeeds

    handle({ ctx, sessionId, dir, move: mockMove });

    expect(spawnSync).toHaveBeenCalledWith(
      "limactl",
      ["start", sessionId, "--yes"],
      { stdio: "ignore" },
    );
  });

  it("handles lima start failure (does not throw)", () => {
    const sessionId = "fail-start";
    const dir = path.join(ctx.openpodRoot, sessionId);
    fs.mkdirSync(dir, { recursive: true });

    spawn
      .mockReturnValueOnce({ status: 0 }) // git
      .mockReturnValueOnce({ status: 0 }) // lima exists
      .mockReturnValueOnce({ status: 1 }); // start fails

    handle({ ctx, sessionId, dir, move: mockMove });
  });

  it("handles git clone failure and does not move", () => {
    const sessionId = "clone-fail";
    const dir = "/proj";
    const origin = "https://bad";

    spawn
      .mockReturnValueOnce({ status: 0 }) // git
      .mockReturnValueOnce({ status: 0, stdout: origin + "\n" })
      .mockReturnValueOnce({ status: 1 }); // clone fails -- no more calls

    handle({ ctx, sessionId, dir, move: mockMove });

    expect(mockMove).not.toHaveBeenCalled();
    // no lima/start since returned early
    expect(spawnSync).not.toHaveBeenCalledWith(
      expect.stringContaining("limactl"),
      expect.any(Array),
      expect.any(Object),
    );
  });
});
