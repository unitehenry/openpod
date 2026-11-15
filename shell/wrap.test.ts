import { describe, it, expect, beforeAll } from "vitest";
import * as path from "node:path";

import type { OpenpodContext } from "../context";
import { init } from "../context";
import { wrap } from "./wrap";

describe("wrap", () => {
  let ctx: OpenpodContext;

  beforeAll(async () => {
    ctx = await init();
  });

  it("returns original command when cwd is outside openpodRoot", async () => {
    const command = "echo hello";
    const result = await wrap(ctx, "/tmp/some/random/dir", command);
    expect(result).toBe(command);
  });

  it("returns original command when cwd is exactly openpodRoot", async () => {
    const command = "ls";
    const result = await wrap(ctx, ctx.openpodRoot, command);
    expect(result).toBe(command);
  });

  it("wraps command using first directory segment as lima name", async () => {
    const session = "my-session-abc";
    const cwd = path.join(ctx.openpodRoot, session);
    const command = "npm run dev";
    const result = await wrap(ctx, cwd, command);

    expect(result).toBe(
      `limactl shell --preserve-env --workdir='${cwd}' ${session} bash -c '${command}'`,
    );
  });

  it("uses only the first segment even for nested directories", async () => {
    const session = "sess-xyz";
    const cwd = path.join(ctx.openpodRoot, session, "src", "app");
    const command = "cat package.json";
    const result = await wrap(ctx, cwd, command);

    expect(result).toBe(
      `limactl shell --preserve-env --workdir='${cwd}' ${session} bash -c '${command}'`,
    );
  });

  it("escapes single quotes in cwd and command", async () => {
    const session = "sess'with'quotes";
    const cwd = path.join(ctx.openpodRoot, session, "sub'dir");
    const command = "echo 'hello world'";
    const result = await wrap(ctx, cwd, command);

    const escapedCwd = cwd.replace(/'/g, "'\\''");
    const escapedCmd = command.replace(/'/g, "'\\''");
    const expected = `limactl shell --preserve-env --workdir='${escapedCwd}' ${session} bash -c '${escapedCmd}'`;

    expect(result).toBe(expected);
  });

  it("returns original command for paths that would escape the tree", async () => {
    const command = "pwd";
    const outside = path.join(ctx.openpodRoot, "..", "escape");
    const result = await wrap(ctx, outside, command);
    expect(result).toBe(command);
  });
});
