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
import { clear } from "./clear";

describe("clear", () => {
  let ctx: OpenpodContext;
  let cleanupExecute: ReturnType<
    typeof vi.fn<(sessionID: string) => Promise<void>>
  >;
  let baseCtx: OpenpodContext;

  beforeAll(async () => {
    baseCtx = await init();
  });

  beforeEach(() => {
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
    cleanupExecute = vi.fn();
    ctx.cleanup = { execute: cleanupExecute };
  });

  afterEach(() => {
    if (fs.existsSync(ctx.openpodRoot)) {
      fs.rmSync(ctx.openpodRoot, { recursive: true, force: true });
    }
  });

  it("removes session directories", async () => {
    fs.mkdirSync(path.join(ctx.openpodRoot, "session-abc"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(ctx.openpodRoot, "session-xyz", "nested"), {
      recursive: true,
    });

    await clear(ctx);

    expect(fs.existsSync(ctx.openpodRoot)).toBe(false);
    expect(fs.existsSync(path.join(ctx.openpodRoot, "session-abc"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(ctx.openpodRoot, "session-xyz"))).toBe(
      false,
    );
    expect(cleanupExecute).toHaveBeenCalledWith("session-abc");
    expect(cleanupExecute).toHaveBeenCalledWith("session-xyz");
  });

  it("ignores non-directory entries and cleans sessions", async () => {
    fs.mkdirSync(ctx.openpodRoot, { recursive: true });
    fs.writeFileSync(path.join(ctx.openpodRoot, "not-a-dir.txt"), "data");
    fs.mkdirSync(path.join(ctx.openpodRoot, "real-session"), {
      recursive: true,
    });

    await clear(ctx);

    expect(fs.existsSync(ctx.openpodRoot)).toBe(false);
    expect(fs.existsSync(path.join(ctx.openpodRoot, "real-session"))).toBe(
      false,
    );
    expect(cleanupExecute).toHaveBeenCalledWith("real-session");
  });
});
