import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

import { initCleanup } from "./cleanup";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: vi.fn(),
  };
});

describe("cleanup", () => {
  let tempRoot: string;

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
  });

  afterEach(() => {
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("returns a cleanup with execute function", () => {
    const cleanup = initCleanup(tempRoot);
    expect(cleanup).toHaveProperty("execute");
    expect(typeof cleanup.execute).toBe("function");
  });

  it("returns early for invalid sessionID", async () => {
    const cleanup = initCleanup(tempRoot);
    await cleanup.execute("");
    // @ts-expect-error testing runtime guard
    await cleanup.execute(null);
    // @ts-expect-error testing runtime guard
    await cleanup.execute(undefined);

    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("attempts lima stop/delete", async () => {
    const cleanup = initCleanup(tempRoot);
    const sessionID = "test-session";
    await cleanup.execute(sessionID);

    expect(spawnSync).toHaveBeenCalledWith(
      "limactl",
      ["stop", sessionID, "--force"],
      {
        stdio: "ignore",
      },
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "limactl",
      ["delete", sessionID, "--force"],
      {
        stdio: "ignore",
      },
    );
  });

  it("removes existing pod directory", async () => {
    const sessionID = "to-remove";
    const podDir = path.join(tempRoot, sessionID);
    fs.mkdirSync(podDir, { recursive: true });
    fs.writeFileSync(path.join(podDir, "file.txt"), "data");

    const cleanup = initCleanup(tempRoot);
    await cleanup.execute(sessionID);

    expect(fs.existsSync(podDir)).toBe(false);
  });
});
