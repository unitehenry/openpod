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

import type { OpenpodContext } from "../context";
import { init } from "../context";
import { clear } from "./clear";

describe("clear", () => {
  let ctx: OpenpodContext;
  let cleanupExecute: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    ctx = await init();
  });

  beforeEach(() => {
    if (fs.existsSync(ctx.openpodRoot)) {
      fs.rmSync(ctx.openpodRoot, { recursive: true, force: true });
    }
    cleanupExecute = vi.fn();
    ctx.cleanup = { execute: cleanupExecute };
  });

  afterEach(() => {
    if (fs.existsSync(ctx.openpodRoot)) {
      fs.rmSync(ctx.openpodRoot, { recursive: true, force: true });
    }
  });

  it("logs start and leaves only .log dir (due to logging) even if root did not exist", async () => {
    await clear(ctx);
    expect(fs.existsSync(ctx.openpodRoot)).toBe(true);
    const entries = fs.readdirSync(ctx.openpodRoot);
    expect(entries).toContain(".log");
    expect(cleanupExecute).toHaveBeenCalledWith(".log");
  });

  it("removes session directories and leaves only .log after cleanup", async () => {
    fs.mkdirSync(path.join(ctx.openpodRoot, "session-abc"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(ctx.openpodRoot, "session-xyz", "nested"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(ctx.openpodRoot, ".log"), { recursive: true });

    await clear(ctx);

    expect(fs.existsSync(ctx.openpodRoot)).toBe(true);
    const entries = fs.readdirSync(ctx.openpodRoot);
    expect(entries).toEqual([".log"]);
    expect(cleanupExecute).toHaveBeenCalledWith("session-abc");
    expect(cleanupExecute).toHaveBeenCalledWith("session-xyz");
    expect(cleanupExecute).toHaveBeenCalledWith(".log");
  });

  it("ignores non-directory entries and cleans sessions", async () => {
    fs.mkdirSync(ctx.openpodRoot, { recursive: true });
    fs.writeFileSync(path.join(ctx.openpodRoot, "not-a-dir.txt"), "data");
    fs.mkdirSync(path.join(ctx.openpodRoot, "real-session"), {
      recursive: true,
    });

    await clear(ctx);

    expect(fs.existsSync(ctx.openpodRoot)).toBe(true);
    const entries = fs.readdirSync(ctx.openpodRoot);
    expect(entries).toEqual([".log"]);
    expect(cleanupExecute).toHaveBeenCalledWith("real-session");
    expect(cleanupExecute).toHaveBeenCalledWith(".log");
  });

  it("handles errors gracefully without throwing", async () => {
    fs.mkdirSync(ctx.openpodRoot, { recursive: true });
    await expect(clear(ctx)).resolves.not.toThrow();
  });
});
