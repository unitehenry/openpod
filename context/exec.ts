import { execFile, type ExecFileOptions } from "node:child_process";

export type ExecResult = {
  status: number;
  stdout: string;
  stderr: string;
};

/**
 * Run a command without blocking the event loop. Unlike `execFile`'s promise
 * form, this resolves for non-zero exit codes so callers can handle command
 * failures explicitly.
 */
export function exec(
  command: string,
  args: readonly string[],
  options: ExecFileOptions = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    try {
      execFile(
        command,
        args,
        { maxBuffer: 10 * 1024 * 1024, ...options },
        (error, stdout, stderr) => {
          const code = (error as NodeJS.ErrnoException | null)?.code;
          resolve({
            status: typeof code === "number" ? code : error ? 1 : 0,
            stdout: stdout?.toString() ?? "",
            stderr: stderr?.toString() ?? "",
          });
        },
      );
    } catch {
      resolve({ status: 1, stdout: "", stderr: "" });
    }
  });
}
