import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { HOST_DAEMON_PROTOCOL_VERSION } from "@bb/host-daemon-contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostDaemonLogger } from "./logger.js";
import {
  createProtocolSelfUpdater,
  SELF_UPDATE_INITIAL_RETRY_DELAY_MS,
  SELF_UPDATE_MAX_RETRY_DELAY_MS,
} from "./protocol-self-update.js";

const roots: string[] = [];

function logger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } satisfies HostDaemonLogger;
}

async function createFixture(
  args: {
    currentVersion?: string;
    downloadFailure?: boolean;
    enabled?: boolean;
    installFailure?: Error;
    now?: () => number;
    protocolVersion?: number;
    serverUrl?: string;
    serverVersion?: string;
    useDefaultInstaller?: boolean;
    verifiedVersion?: string;
  } = {},
) {
  const dataDir = await mkdtemp(join(tmpdir(), "bb-self-update-test-"));
  roots.push(dataDir);
  const installTarball = vi.fn(async () => {
    if (args.installFailure) throw args.installFailure;
  });
  const runProcess = vi.fn(async () => undefined);
  let versionRequestCount = 0;
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/install/version") {
      const version =
        versionRequestCount === 0
          ? (args.serverVersion ?? "9.0.0-test")
          : (args.verifiedVersion ??
            args.serverVersion ??
            "9.0.0-test");
      versionRequestCount += 1;
      return Response.json({
        version,
        protocolVersion:
          args.protocolVersion ?? HOST_DAEMON_PROTOCOL_VERSION + 1,
      });
    }
    if (url.pathname === "/install/bb-app.tgz") {
      return args.downloadFailure
        ? new Response("unavailable", { status: 503 })
        : new Response("tarball");
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const testLogger = logger();
  const updater = createProtocolSelfUpdater({
    currentVersion: args.currentVersion ?? "8.0.0-test",
    dataDir,
    enabled: args.enabled ?? true,
    fetchFn,
    ...(args.useDefaultInstaller ? { runProcess } : { installTarball }),
    logger: testLogger,
    now: args.now,
    serverUrl: args.serverUrl ?? "https://server.example.test",
  });
  return { fetchFn, installTarball, logger: testLogger, runProcess, updater };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("protocol self-update", () => {
  it("installs exactly once when the server protocol is newer and enabled", async () => {
    const test = await createFixture();
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "updated",
    );
    expect(test.fetchFn).toHaveBeenCalledTimes(2);
    expect(test.installTarball).toHaveBeenCalledOnce();
  });

  it("finds npm beside the running Node executable when the service PATH omits it", async () => {
    vi.stubEnv("PATH", "/usr/bin:/bin");
    const test = await createFixture({ useDefaultInstaller: true });

    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "updated",
    );

    expect(test.runProcess).toHaveBeenCalledOnce();
    expect(test.runProcess).toHaveBeenCalledWith(
      "npm",
      [
        "install",
        "-g",
        "--allow-scripts=better-sqlite3,node-pty,@parcel/watcher",
        expect.stringContaining("bb-app-update-"),
      ],
      {
        env: expect.objectContaining({
          PATH: `${dirname(process.execPath)}${delimiter}/usr/bin:/bin`,
        }),
      },
    );
  });

  it("updates an installer-managed bb-app inside its machine-specific prefix", async () => {
    vi.stubEnv("BB_APP_NPM_PREFIX", "/machine-data/npm");
    const test = await createFixture({ useDefaultInstaller: true });

    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "updated",
    );

    expect(test.runProcess).toHaveBeenCalledWith(
      "npm",
      [
        "install",
        "-g",
        "--allow-scripts=better-sqlite3,node-pty,@parcel/watcher",
        "--prefix",
        "/machine-data/npm",
        expect.stringContaining("bb-app-update-"),
      ],
      expect.any(Object),
    );
  });

  it("keeps legacy global updates when the installer prefix is blank", async () => {
    vi.stubEnv("BB_APP_NPM_PREFIX", " ");
    const test = await createFixture({ useDefaultInstaller: true });

    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "updated",
    );

    expect(test.runProcess).toHaveBeenCalledWith(
      "npm",
      [
        "install",
        "-g",
        "--allow-scripts=better-sqlite3,node-pty,@parcel/watcher",
        expect.stringContaining("bb-app-update-"),
      ],
      expect.any(Object),
    );
  });

  it("does nothing when auto-update is disabled", async () => {
    const test = await createFixture({ enabled: false });
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "skipped",
    );
    expect(test.fetchFn).not.toHaveBeenCalled();
    expect(test.installTarball).not.toHaveBeenCalled();
  });

  it("refuses auto-update over non-loopback HTTP", async () => {
    const test = await createFixture({
      serverUrl: "http://server.example.test",
    });
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe("failed");
    expect(test.fetchFn).not.toHaveBeenCalled();
    expect(test.installTarball).not.toHaveBeenCalled();
    expect(test.logger.error).toHaveBeenCalledWith(
      { serverUrl: "http://server.example.test" },
      expect.stringContaining("insecure transport"),
    );
  });

  it("allows auto-update over loopback HTTP", async () => {
    const test = await createFixture({ serverUrl: "http://127.0.0.1:38886" });
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "updated",
    );
    expect(test.installTarball).toHaveBeenCalledOnce();
  });

  it("refuses equal protocol reinstalls and downgrades", async () => {
    for (const protocolVersion of [
      HOST_DAEMON_PROTOCOL_VERSION,
      HOST_DAEMON_PROTOCOL_VERSION - 1,
    ]) {
      const test = await createFixture({ protocolVersion });
      await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
        "skipped",
      );
      expect(test.installTarball).not.toHaveBeenCalled();
    }
  });

  it("persists a short exponential retry backoff capped at five minutes", async () => {
    let now = 10_000;
    const test = await createFixture({ now: () => now });
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "updated",
    );
    now += SELF_UPDATE_INITIAL_RETRY_DELAY_MS - 1;
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "skipped",
    );
    expect(test.installTarball).toHaveBeenCalledOnce();

    now += 1;
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "updated",
    );
    expect(test.installTarball).toHaveBeenCalledTimes(2);

    for (let attemptCount = 2; attemptCount < 8; attemptCount += 1) {
      now += Math.min(
        SELF_UPDATE_INITIAL_RETRY_DELAY_MS * 2 ** (attemptCount - 1),
        SELF_UPDATE_MAX_RETRY_DELAY_MS,
      );
      await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
        "updated",
      );
    }

    now += SELF_UPDATE_MAX_RETRY_DELAY_MS - 1;
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "skipped",
    );
  });

  it("contains install failures and rate-limits their retry", async () => {
    const test = await createFixture({
      installFailure: new Error("npm failed"),
      now: () => 25_000,
    });
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe("failed");
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "skipped",
    );
    expect(test.installTarball).toHaveBeenCalledOnce();
    expect(test.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining("self-update failed"),
    );
  });

  it("lets a user-requested retry bypass and reset the current backoff", async () => {
    let now = 25_000;
    const test = await createFixture({
      installFailure: new Error("download failed"),
      now: () => now,
    });
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe("failed");
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "skipped",
    );

    await expect(
      test.updater.handleProtocolMismatch({ force: true }),
    ).resolves.toBe("failed");
    expect(test.installTarball).toHaveBeenCalledTimes(2);

    now += SELF_UPDATE_INITIAL_RETRY_DELAY_MS;
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe("failed");
    expect(test.installTarball).toHaveBeenCalledTimes(3);
  });

  it("tries immediately when the server advances to another protocol", async () => {
    let now = 30_000;
    let protocolVersion = HOST_DAEMON_PROTOCOL_VERSION + 1;
    const test = await createFixture({ now: () => now });
    test.fetchFn.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/install/version") {
        return Response.json({ version: "test", protocolVersion });
      }
      return new Response("tarball");
    });

    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "updated",
    );
    protocolVersion += 1;
    await expect(test.updater.handleProtocolMismatch()).resolves.toBe(
      "updated",
    );
    expect(test.installTarball).toHaveBeenCalledTimes(2);
  });

  it("installs a same-protocol target once and then reports it current", async () => {
    const test = await createFixture({
      protocolVersion: HOST_DAEMON_PROTOCOL_VERSION,
      serverVersion: "9.1.0-test",
    });

    await expect(
      test.updater.installServerRelease({ expectedVersion: "9.1.0-test" }),
    ).resolves.toEqual({
      outcome: "installed",
      version: "9.1.0-test",
    });
    await expect(
      test.updater.installServerRelease({ expectedVersion: "9.1.0-test" }),
    ).resolves.toEqual({
      outcome: "already-current",
      version: "9.1.0-test",
    });
    const tarballRequest = test.fetchFn.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname === "/install/bb-app.tgz");
    expect(tarballRequest?.searchParams.get("version")).toBe("9.1.0-test");
    expect(test.installTarball).toHaveBeenCalledOnce();
  });

  it("does not download an exact current release", async () => {
    const test = await createFixture({
      currentVersion: "9.1.0-test",
      enabled: false,
      protocolVersion: HOST_DAEMON_PROTOCOL_VERSION,
      serverVersion: "9.1.0-test",
    });

    await expect(
      test.updater.installServerRelease({ expectedVersion: "9.1.0-test" }),
    ).resolves.toEqual({
      outcome: "already-current",
      version: "9.1.0-test",
    });
    expect(test.fetchFn).toHaveBeenCalledOnce();
    expect(test.installTarball).not.toHaveBeenCalled();
  });

  it("rejects a release that changes while its tarball downloads", async () => {
    const test = await createFixture({
      protocolVersion: HOST_DAEMON_PROTOCOL_VERSION,
      serverVersion: "9.1.0-test",
      verifiedVersion: "9.2.0-test",
    });

    await expect(
      test.updater.installServerRelease({ expectedVersion: "9.1.0-test" }),
    ).rejects.toThrow(
      "Server release changed: expected 9.1.0-test, received 9.2.0-test",
    );
    expect(test.installTarball).not.toHaveBeenCalled();
  });

  it.each([
    {
      args: { enabled: false },
      expectedError: "requires auto-update",
      name: "disabled update",
    },
    {
      args: { serverUrl: "http://server.example.test" },
      expectedError: "insecure transport",
      name: "insecure transport",
    },
    {
      args: {
        protocolVersion: HOST_DAEMON_PROTOCOL_VERSION - 1,
      },
      expectedError: "older than daemon protocol",
      name: "older server protocol",
    },
  ])("rejects $name", async ({ args, expectedError }) => {
    const test = await createFixture({
      ...args,
      serverVersion: "9.1.0-test",
    });

    await expect(
      test.updater.installServerRelease({ expectedVersion: "9.1.0-test" }),
    ).rejects.toThrow(expectedError);
    expect(test.installTarball).not.toHaveBeenCalled();
  });

  it.each([
    {
      args: { downloadFailure: true },
      expectedError: "Package download failed: 503",
      name: "download",
    },
    {
      args: { installFailure: new Error("npm install failed") },
      expectedError: "npm install failed",
      name: "install",
    },
  ])("exposes $name failures", async ({ args, expectedError }) => {
    const test = await createFixture({
      ...args,
      protocolVersion: HOST_DAEMON_PROTOCOL_VERSION,
      serverVersion: "9.1.0-test",
    });

    await expect(
      test.updater.installServerRelease({ expectedVersion: "9.1.0-test" }),
    ).rejects.toThrow(expectedError);
  });

  it("does not carry backoff across same-protocol target versions", async () => {
    let serverVersion = "9.1.0-test";
    const test = await createFixture({
      installFailure: new Error("npm install failed"),
      now: () => 40_000,
      protocolVersion: HOST_DAEMON_PROTOCOL_VERSION,
    });
    test.fetchFn.mockImplementation(async (input: RequestInfo | URL) => {
      return new URL(String(input)).pathname === "/install/version"
        ? Response.json({
            version: serverVersion,
            protocolVersion: HOST_DAEMON_PROTOCOL_VERSION,
          })
        : new Response("tarball");
    });

    await expect(
      test.updater.installServerRelease({ expectedVersion: serverVersion }),
    ).rejects.toThrow("npm install failed");
    serverVersion = "9.2.0-test";
    await expect(
      test.updater.installServerRelease({ expectedVersion: serverVersion }),
    ).rejects.toThrow("npm install failed");
    expect(test.installTarball).toHaveBeenCalledTimes(2);
  });
});
