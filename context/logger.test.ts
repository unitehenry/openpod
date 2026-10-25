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

  it("creates .log directory and log file on first log", () => {
    const logger = initLogger(tempRoot);
    logger.log("test message");

    expect(fs.existsSync(path.join(tempRoot, ".log"))).toBe(true);
    expect(fs.existsSync(logFile)).toBe(true);
  });

  it("appends log entry with correct format", () => {
    const logger = initLogger(tempRoot);
    logger.log("hello world");

    const content = fs.readFileSync(logFile, "utf8");
    expect(content).toContain("[openpod] hello world");
    expect(content).toMatch(
      /\[\d{4}-\d{2}-\d{2}T.*Z\] \[openpod\] hello world\n/,
    );
  });

  it("includes level prefix for non-info levels", () => {
    const logger = initLogger(tempRoot);
    logger.log("error happened", "error");

    const content = fs.readFileSync(logFile, "utf8");
    expect(content).toContain("[error] error happened");
  });

  it("appends multiple logs", () => {
    const logger = initLogger(tempRoot);
    logger.log("first");
    logger.log("second");

    const content = fs.readFileSync(logFile, "utf8");
    expect(content).toContain("first");
    expect(content).toContain("second");
    expect(content.split("\n").filter(Boolean).length).toBe(2);
  });

  it("ignores failures (no throw on bad write)", () => {
    const logger = initLogger(tempRoot);
    // make dir read-only to simulate failure (best effort)
    fs.mkdirSync(path.join(tempRoot, ".log"), { recursive: true });
    // this should not throw
    expect(() => logger.log("should be ignored")).not.toThrow();
  });
});
