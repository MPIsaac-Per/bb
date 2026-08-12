import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { PiSdkSession } from "../sdk-session.js";

const testRoots: string[] = [];

async function createLifecycleFixture(): Promise<{
  cwd: string;
  markerPath: string;
  sessionFilePath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "bb-pi-lifecycle-test-"));
  testRoots.push(root);
  const agentDir = join(root, "agent");
  const cwd = join(root, "workspace");
  const markerPath = join(root, "lifecycle-events.txt");

  await mkdir(join(cwd, ".pi", "extensions"), { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    join(agentDir, "settings.json"),
    JSON.stringify({ defaultProjectTrust: "always" }),
  );
  await writeFile(
    join(cwd, ".pi", "settings.json"),
    JSON.stringify({ extensions: ["./extensions/lifecycle.ts"] }),
  );
  await writeFile(
    join(cwd, ".pi", "extensions", "lifecycle.ts"),
    `import { appendFileSync } from "node:fs";
export default function extension(pi): void {
  pi.on("session_start", (event) => {
    appendFileSync(${JSON.stringify(markerPath)}, event.type + "\\n", "utf8");
  });
  pi.on("session_shutdown", (event) => {
    appendFileSync(${JSON.stringify(markerPath)}, event.type + "\\n", "utf8");
  });
}
`,
  );
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);

  const sessionFilePath = SessionManager.create(cwd, root).getSessionFile();
  if (!sessionFilePath) throw new Error("Expected a persistent session file");

  return { cwd, markerPath, sessionFilePath };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    testRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("PiSdkSession extension lifecycle", () => {
  it("starts configured extensions before accepting prompts", async () => {
    const { cwd, markerPath } = await createLifecycleFixture();
    const session = new PiSdkSession({ cwd }, vi.fn(), vi.fn());

    await session.start();

    await expect(readFile(markerPath, "utf8")).resolves.toBe("session_start\n");
    await session.closeGracefully(1_000);
  });

  it("rebinds extensions when a persisted session is replaced", async () => {
    const { cwd, markerPath, sessionFilePath } = await createLifecycleFixture();
    const session = new PiSdkSession(
      { cwd, sessionFilePath },
      vi.fn(),
      vi.fn(),
    );

    await session.start();
    await session.closeGracefully(1_000);

    const replacement = new PiSdkSession(
      { cwd, sessionFilePath },
      vi.fn(),
      vi.fn(),
    );
    await replacement.start();
    await replacement.closeGracefully(1_000);

    await expect(readFile(markerPath, "utf8")).resolves.toBe(
      "session_start\nsession_shutdown\nsession_start\nsession_shutdown\n",
    );
  });
});
