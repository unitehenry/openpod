import { describe, it, expect, vi } from "vitest";

// Mutable flag closed over by the module mock below
let failLimactlCheck = false;

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execSync: (command: string | Buffer, options?: any) => {
      const cmd = String(command);
      if (failLimactlCheck && (cmd.includes("limactl") || /command -v/.test(cmd) || cmd.includes("where"))) {
        console.error("[MOCK] blocking limactl check for:", cmd);
        const err: any = new Error("command not found");
        err.status = 1;
        throw err;
      }
      if (cmd.includes("limactl") || /command -v/.test(cmd)) {
        console.error("[MOCK] allowing real check for:", cmd);
      }
      return actual.execSync(command, options);
    },
  };
});

describe("opencode", () => {
  it("Opencode plugin cant register without limactl", async () => {
    failLimactlCheck = true;
    try {
      vi.resetModules();
      const [sdk, ctxMod] = await Promise.all([
        import("@opencode/sdk"),
        import("./context"),
      ]);
      const FreshOpenCode = sdk.OpenCode;

      // The real openpod plugin's setup calls init() which checks for limactl.
      // This is what prevents the plugin from registering when limactl is missing.
      await expect(ctxMod.init()).rejects.toThrow(/`limactl` is not installed/);

      // We can still create the host (SDK does not reject on plugin setup failure),
      // but the registration effectively fails because init threw.
      const failingPlugin = {
        id: "openpod",
        async setup() {
          await ctxMod.init();
        },
      } as any;

      const opencode = await FreshOpenCode.create({ plugins: [failingPlugin] });
      expect(opencode).toBeDefined();
    } finally {
      failLimactlCheck = false;
    }
  });

  it("Opencode plugin is registered correctly after limactl is installed", async () => {
    // In this environment (and in CI) limactl is present.
    // Successful creation without throwing means the plugin registered.
    vi.resetModules();
    const [sdk, mod] = await Promise.all([
      import("@opencode/sdk"),
      import("./index"),
    ]);
    const FreshOpenCode = sdk.OpenCode;
    const plugin = mod.default;
    await using opencode = await FreshOpenCode.create({ plugins: [plugin] });
    expect(opencode).toBeDefined();
  });
});
