import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveMpivVersion,
  prepareMpivVersion,
} from "../../../scripts/prepare-mpiv-version.mjs";
import { prepareMpivArtifact } from "../../../scripts/prepare-mpiv-artifact.mjs";
import { deployMpivHub } from "../../../scripts/mpiv-hub-deploy.mjs";

const repoRoot = resolve(import.meta.dirname, "../../..");
const testRoots = [];

function createPackageJson(name, version) {
  return `${JSON.stringify({ name, version, type: "module", files: ["index.js"] }, null, 2)}\n`;
}

function runGit(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createVersionRepo(version) {
  const root = mkdtempSync(join(tmpdir(), "bb-mpiv-version-"));
  testRoots.push(root);
  mkdirSync(join(root, "packages", "bb-app"), { recursive: true });
  mkdirSync(join(root, "apps", "desktop"), { recursive: true });
  writeFileSync(
    join(root, "packages", "bb-app", "package.json"),
    createPackageJson("bb-app", version),
  );
  writeFileSync(
    join(root, "apps", "desktop", "package.json"),
    createPackageJson("@bb/desktop", version),
  );
  return root;
}

function createArtifactRepo(version) {
  const root = createVersionRepo(version);
  mkdirSync(join(root, "packages", "host-daemon-contract", "src"), {
    recursive: true,
  });
  writeFileSync(join(root, "packages", "bb-app", "index.js"), "export {};\n");
  writeFileSync(
    join(root, "packages", "host-daemon-contract", "src", "protocol.ts"),
    "export const HOST_DAEMON_PROTOCOL_VERSION = 174 as const;\n",
  );
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "test@example.com"]);
  runGit(root, ["config", "user.name", "Test User"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "upstream"]);
  runGit(root, ["branch", "upstream-base"]);
  writeFileSync(join(root, "custom.txt"), "mpiv\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "custom"]);
  return root;
}

function createDeploymentFixture() {
  const root = mkdtempSync(join(tmpdir(), "bb-mpiv-deploy-"));
  testRoots.push(root);
  const artifactPath = join(root, "bb-app-1.2.4-mpiv.10.1.tgz");
  const manifestPath = join(root, "mpiv-provenance.json");
  writeFileSync(artifactPath, "artifact");
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        artifact: {
          file: "bb-app-1.2.4-mpiv.10.1.tgz",
          sha256:
            "c7c5c1d70c5dec4416ab6158afd0b223ef40c29b1dc1f97ed9428b94d4cadb1c",
        },
        createdAt: "2026-08-30T12:00:00.000Z",
        customCommitCount: 1,
        distribution: "mpiv",
        protocolVersion: 174,
        schemaVersion: 1,
        sourceBranch: "mpiv/prod",
        sourceCommit: "1234567890abcdef",
        upstreamBase: "abcdef1234567890",
        version: "1.2.4-mpiv.10.1",
      },
      null,
      2,
    )}\n`,
  );
  return { artifactPath, manifestPath };
}

afterEach(() => {
  for (const root of testRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("MPIV version", () => {
  it("derives an immutable next-patch downstream version", () => {
    expect(deriveMpivVersion("1.2.3", "123456", "2")).toBe(
      "1.2.4-mpiv.123456.2",
    );
    expect(deriveMpivVersion("1.2.3-nightly.8.1", "123456", "2")).toBe(
      "1.2.4-mpiv.123456.2",
    );
  });

  it("rejects identifiers that cannot establish release ordering", () => {
    expect(() => deriveMpivVersion("1.2.3", "run-1", "1")).toThrow(
      "GITHUB_RUN_ID must be a positive integer",
    );
    expect(() => deriveMpivVersion("1.2.3", "1", "0")).toThrow(
      "GITHUB_RUN_ATTEMPT must be a positive integer",
    );
  });

  it("keeps the server package and desktop shell versions in lockstep", async () => {
    const root = createVersionRepo("1.2.3");
    await expect(
      prepareMpivVersion({ repoRoot: root, runAttempt: "1", runId: "99" }),
    ).resolves.toBe("1.2.4-mpiv.99.1");
    expect(
      JSON.parse(
        readFileSync(join(root, "packages", "bb-app", "package.json"), "utf8"),
      ).version,
    ).toBe("1.2.4-mpiv.99.1");
    expect(
      JSON.parse(
        readFileSync(join(root, "apps", "desktop", "package.json"), "utf8"),
      ).version,
    ).toBe("1.2.4-mpiv.99.1");
  });
});

describe("MPIV artifact", () => {
  it("packs the downstream package with commit and protocol provenance", async () => {
    const root = createArtifactRepo("1.2.4-mpiv.10.1");
    const outputDir = join(root, "release");
    const result = await prepareMpivArtifact({
      createdAt: "2026-08-30T12:00:00.000Z",
      outputDir,
      repoRoot: root,
      sourceBranch: "mpiv/prod",
      upstreamRef: "upstream-base",
    });
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));

    expect(result.artifactPath).toBe(
      join(outputDir, "bb-app-1.2.4-mpiv.10.1.tgz"),
    );
    expect(manifest).toMatchObject({
      artifact: {
        file: "bb-app-1.2.4-mpiv.10.1.tgz",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
      createdAt: "2026-08-30T12:00:00.000Z",
      customCommitCount: 1,
      distribution: "mpiv",
      protocolVersion: 174,
      schemaVersion: 1,
      sourceBranch: "mpiv/prod",
      sourceCommit: runGit(root, ["rev-parse", "HEAD"]),
      upstreamBase: runGit(root, ["rev-parse", "upstream-base"]),
      version: "1.2.4-mpiv.10.1",
    });
  });
});

describe("MPIV Hub deployment", () => {
  it("is non-mutating until the operator passes --deploy", async () => {
    const fixture = createDeploymentFixture();
    const runCommand = vi.fn();
    const result = await deployMpivHub({
      ...fixture,
      deploy: false,
      runCommand,
    });

    expect(result).toMatchObject({
      host: "hub",
      mode: "plan",
      version: "1.2.4-mpiv.10.1",
    });
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("uploads one verified release and sends the rollback-first installer", async () => {
    const fixture = createDeploymentFixture();
    const runCommand = vi.fn(async () => ({ stderr: "", stdout: "" }));
    const result = await deployMpivHub({
      ...fixture,
      deploy: true,
      runCommand,
    });

    expect(result.mode).toBe("deployed");
    expect(runCommand).toHaveBeenCalledTimes(3);
    expect(runCommand.mock.calls[0][0]).toMatchObject({
      args: expect.arrayContaining(["hub"]),
      command: "ssh",
    });
    expect(runCommand.mock.calls[1][0]).toMatchObject({
      command: "scp",
    });
    expect(runCommand.mock.calls[2][0]).toMatchObject({
      command: "ssh",
      input: expect.stringContaining("sqlite3"),
    });
    expect(runCommand.mock.calls[2][0].input).toContain("npm pack");
    expect(runCommand.mock.calls[2][0].input).toContain("rollback");
    expect(runCommand.mock.calls[2][0].input).toContain("/install/version");
    expect(runCommand.mock.calls[2][0].input).toContain(
      'systemctl --user restart "$service"',
    );
    expect(
      spawnSync("bash", ["-n"], {
        encoding: "utf8",
        input: runCommand.mock.calls[2][0].input,
      }),
    ).toMatchObject({ status: 0, stderr: "" });
  });
});

describe("MPIV workflows", () => {
  it("records the live delivery tier and durable operating contract", () => {
    const instructions = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
    const spec = readFileSync(
      join(repoRoot, "docs", "specs", "mpiv-downstream-distribution.md"),
      "utf8",
    );
    const runbook = readFileSync(
      join(repoRoot, "docs", "mpiv-downstream-operations.md"),
      "utf8",
    );

    expect(instructions).toContain("Delivery tier: T2 Live");
    expect(instructions).toContain("mpiv-downstream-distribution.md");
    expect(spec).toContain("Seam: the immutable `bb-app.tgz`");
    expect(spec).toContain("Rollback:");
    expect(spec).toContain("## Removal");
    expect(runbook).toContain("## Runtime Alignment");
    expect(runbook).toContain("## Rollback And Removal");
  });

  it("builds mpiv/prod without publishing to npm or deploying", () => {
    const workflow = readFileSync(
      join(repoRoot, ".github", "workflows", "mpiv-build.yml"),
      "utf8",
    );

    expect(workflow).toContain("mpiv/prod");
    expect(workflow).toContain("prepare-mpiv-version.mjs");
    expect(workflow).toContain("prepare-mpiv-artifact.mjs");
    expect(workflow).toContain("turbo run build typecheck lint");
    expect(workflow).toContain("turbo run test");
    expect(workflow).toContain("actions/upload-artifact");
    expect(workflow).not.toContain("npm publish");
    expect(workflow).not.toContain("mpiv-hub-deploy");
  });

  it("prepares one non-deploying upstream integration pull request", () => {
    const workflow = readFileSync(
      join(repoRoot, ".github", "workflows", "mpiv-upstream-sync.yml"),
      "utf8",
    );

    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("https://github.com/get-bb/bb.git");
    expect(workflow).toContain("automation/upstream-sync");
    expect(workflow).toContain("actions/permissions/workflow");
    expect(workflow).toContain("--base mpiv/prod");
    expect(workflow).toContain("gh pr create");
    expect(workflow).toContain("> AGENT GENERATED");
    expect(workflow).not.toContain("mpiv-hub-deploy");
  });
});
