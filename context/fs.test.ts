import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { exists } from "./fs";

describe("fs", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = path.join(
      os.tmpdir(),
      `openpod-test-${Date.now()}-${Math.random()}`,
    );
    fs.mkdirSync(tempRoot, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("returns true for an existing path", async () => {
    expect(await exists(tempRoot)).toBe(true);
  });

  it("returns false for a missing path", async () => {
    expect(await exists(path.join(tempRoot, "missing"))).toBe(false);
  });
});
