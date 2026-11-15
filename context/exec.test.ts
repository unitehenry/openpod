import { describe, it, expect, beforeEach, vi } from "vitest";
import { execFile } from "node:child_process";

import { exec } from "./exec";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: vi.fn(),
  };
});

describe("exec", () => {
  const execFileMock = execFile as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves stdout, stderr, and status for a successful command", async () => {
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: readonly string[],
        _options: unknown,
        callback: (error: unknown, stdout: string, stderr: string) => void,
      ) => callback(null, "hello\n", ""),
    );

    const result = await exec("git", ["status"]);

    expect(result).toEqual({
      status: 0,
      stdout: "hello\n",
      stderr: "",
    });
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["status"],
      expect.objectContaining({ maxBuffer: 10 * 1024 * 1024 }),
      expect.any(Function),
    );
  });

  it("resolves a numeric exit status instead of rejecting", async () => {
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: readonly string[],
        _options: unknown,
        callback: (
          error: { code: number },
          stdout: string,
          stderr: string,
        ) => void,
      ) => callback({ code: 2 }, "", "failed"),
    );

    const result = await exec("limactl", ["list", "missing"]);

    expect(result).toEqual({
      status: 2,
      stdout: "",
      stderr: "failed",
    });
  });

  it("uses status 1 for non-numeric execution errors", async () => {
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: readonly string[],
        _options: unknown,
        callback: (
          error: { code: string },
          stdout: string,
          stderr: string,
        ) => void,
      ) => callback({ code: "ENOENT" }, "", ""),
    );

    const result = await exec("missing-command", []);

    expect(result.status).toBe(1);
  });

  it("resolves status 1 when execFile throws synchronously", async () => {
    execFileMock.mockImplementation(() => {
      throw new Error("synchronous failure");
    });

    const result = await exec("broken", []);

    expect(result).toEqual({
      status: 1,
      stdout: "",
      stderr: "",
    });
  });
});
