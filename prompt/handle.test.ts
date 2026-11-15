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

import type { OpenpodContext } from "../context";
import { init } from "../context";
import { exec } from "../context/exec";
import { handle } from "./handle";

vi.mock("../context/exec", () => ({
  exec: vi.fn(),
}));

describe("handle", () => {
  let mockMove: ReturnType<
    typeof vi.fn<(sessionId: string, directory: string) => void>
  >;
  let ctx: OpenpodContext;
  let baseCtx: OpenpodContext;
  const execMock = vi.mocked(exec);

  beforeAll(async () => {
    execMock.mockResolvedValue({
      status: 0,
      stdout: "",
      stderr: "",
    });
    baseCtx = await init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    execMock.mockReset();
    execMock.mockResolvedValue({
      status: 0,
      stdout: "",
      stderr: "",
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

  it("returns a handle function that can be called", async () => {
    // just ensure no throw on basic call
    await handle({
      ctx,
      sessionId: "test",
      dir: "/tmp/some",
      move: mockMove,
    });
  });

  it("returns early if not git enabled", async () => {
    execMock.mockResolvedValue({ status: 1, stdout: "", stderr: "" });

    await handle({
      ctx,
      sessionId: "sess1",
      dir: "/project/dir",
      move: mockMove,
    });

    expect(mockMove).not.toHaveBeenCalled();
    expect(execMock).toHaveBeenCalledWith("git", [
      "-C",
      "/project/dir",
      "rev-parse",
      "--is-inside-work-tree",
    ]);
  });

  it("returns early for invalid git (no origin)", async () => {
    execMock
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // isGitEnabled
      .mockResolvedValueOnce({ status: 1, stdout: "", stderr: "" }); // getOriginUrl

    const dir = "/project/dir";
    await handle({ ctx, sessionId: "sess1", dir, move: mockMove });

    expect(mockMove).not.toHaveBeenCalled();
    expect(execMock).toHaveBeenCalledWith(
      "git",
      ["-C", dir, "remote", "get-url", "origin"],
      { encoding: "utf8" },
    );
  });

  it("clones project and moves when needs move and target does not exist", async () => {
    const sessionId = "clone-sess";
    const dir = "/real/project";
    const target = path.join(ctx.openpodRoot, sessionId);
    const origin = "https://example.com/repo.git";

    execMock
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // isGit
      .mockResolvedValueOnce({
        status: 0,
        stdout: origin + "\n",
        stderr: "",
      }) // getOrigin
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // clone git
      .mockResolvedValueOnce({ status: 1, stdout: "", stderr: "" }) // lima list (not exists)
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // create lima
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }); // start lima

    await handle({ ctx, sessionId, dir, move: mockMove });

    expect(execMock).toHaveBeenCalledWith("git", ["clone", origin, target]);
    expect(mockMove).toHaveBeenCalledWith(sessionId, target);

    // lima create called
    expect(execMock).toHaveBeenCalledWith("limactl", [
      "create",
      `--name=${sessionId}`,
      `--mount-only=${target}:w`,
      "template:default",
      "--yes",
    ]);
    // start
    expect(execMock).toHaveBeenCalledWith("limactl", [
      "start",
      sessionId,
      "--yes",
    ]);
  });

  it("moves session when target already exists (no clone)", async () => {
    const sessionId = "existing";
    const dir = "/other/location";
    const target = path.join(ctx.openpodRoot, sessionId);
    fs.mkdirSync(target, { recursive: true });

    execMock
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // is git
      .mockResolvedValueOnce({ status: 1, stdout: "", stderr: "" }) // lima not
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // create
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }); // start

    await handle({ ctx, sessionId, dir, move: mockMove });

    expect(mockMove).toHaveBeenCalledWith(sessionId, target);
    expect(execMock).not.toHaveBeenCalledWith("git", [
      "clone",
      expect.anything(),
      expect.anything(),
    ]);
  });

  it("does not move when already at target dir", async () => {
    const sessionId = "same";
    const target = path.join(ctx.openpodRoot, sessionId);
    fs.mkdirSync(target, { recursive: true });

    execMock
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // git
      .mockResolvedValueOnce({ status: 1, stdout: "", stderr: "" }) // lima not exist
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" });

    await handle({ ctx, sessionId, dir: target, move: mockMove });

    expect(mockMove).not.toHaveBeenCalled();
  });

  it("skips create if lima instance already exists", async () => {
    const sessionId = "has-lima";
    const dir = path.join(ctx.openpodRoot, sessionId);
    fs.mkdirSync(dir, { recursive: true });

    execMock
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // git
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // lima exists
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }); // start only

    await handle({ ctx, sessionId, dir, move: mockMove });

    expect(execMock).not.toHaveBeenCalledWith(
      "limactl",
      expect.arrayContaining(["create"]),
    );
    expect(execMock).toHaveBeenCalledWith("limactl", [
      "start",
      sessionId,
      "--yes",
    ]);
  });

  it("handles lima create failure but continues to start", async () => {
    const sessionId = "fail-create";
    const dir = "/proj";

    execMock
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // git
      .mockResolvedValueOnce({ status: 0, stdout: "url\n", stderr: "" }) // origin
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // clone
      .mockResolvedValueOnce({ status: 1, stdout: "", stderr: "" }) // lima not
      .mockResolvedValueOnce({ status: 42, stdout: "", stderr: "" }) // create fails
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }); // start succeeds

    await handle({ ctx, sessionId, dir, move: mockMove });

    expect(execMock).toHaveBeenCalledWith("limactl", [
      "start",
      sessionId,
      "--yes",
    ]);
  });

  it("handles lima start failure (does not throw)", async () => {
    const sessionId = "fail-start";
    const dir = path.join(ctx.openpodRoot, sessionId);
    fs.mkdirSync(dir, { recursive: true });

    execMock
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // git
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // lima exists
      .mockResolvedValueOnce({ status: 1, stdout: "", stderr: "" }); // start fails

    await handle({ ctx, sessionId, dir, move: mockMove });
  });

  it("handles git clone failure and does not move", async () => {
    const sessionId = "clone-fail";
    const dir = "/proj";
    const origin = "https://bad";

    execMock
      .mockResolvedValueOnce({ status: 0, stdout: "", stderr: "" }) // git
      .mockResolvedValueOnce({
        status: 0,
        stdout: origin + "\n",
        stderr: "",
      })
      .mockResolvedValueOnce({ status: 1, stdout: "", stderr: "" }); // clone fails

    await handle({ ctx, sessionId, dir, move: mockMove });

    expect(mockMove).not.toHaveBeenCalled();
    // no lima/start since returned early
    expect(execMock).not.toHaveBeenCalledWith("limactl", expect.any(Array));
  });
});
