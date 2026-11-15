import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { initLogger } from "./logger";

describe("logger", () => {
  let tempRoot: string;
  let logFile: string;

  beforeEach(() => {
    tempRoot = path.join(
      os.tmpdir(),
      `openpod-test-${Date.now()}-${Math.random()}`,
    );
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    logFile = path.join(tempRoot, ".log", "openpod.log");
  });

  afterEach(() => {
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("returns a logger with log function", () => {
    const logger = initLogger(tempRoot);
    expect(logger).toHaveProperty("log");
    expect(typeof logger.log).toBe("function");
  });

  it("creates .log directory and log file on first log", async () => {
    const logger = initLogger(tempRoot);
    await logger.log("test message");

    expect(fs.existsSync(path.join(tempRoot, ".log"))).toBe(true);
    expect(fs.existsSync(logFile)).toBe(true);
  });

  it("appends log entry with correct format", async () => {
    const logger = initLogger(tempRoot);
    await logger.log("hello world");

    const content = fs.readFileSync(logFile, "utf8");
    expect(content).toContain("[openpod] hello world");
    expect(content).toMatch(
      /\[\d{4}-\d{2}-\d{2}T.*Z\] \[openpod\] hello world\n/,
    );
  });

  it("includes level prefix for non-info levels", async () => {
    const logger = initLogger(tempRoot);
    await logger.log("error happened", "error");

    const content = fs.readFileSync(logFile, "utf8");
    expect(content).toContain("[error] error happened");
  });

  it("appends multiple logs", async () => {
    const logger = initLogger(tempRoot);
    await logger.log("first");
    await logger.log("second");

    const content = fs.readFileSync(logFile, "utf8");
    expect(content).toContain("first");
    expect(content).toContain("second");
    expect(content.split("\n").filter(Boolean).length).toBe(2);
  });
});
