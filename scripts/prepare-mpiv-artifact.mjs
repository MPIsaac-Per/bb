import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = resolve(dirname(scriptPath), "..");
const mpivVersionPattern = /^\d+\.\d+\.\d+-mpiv\.[1-9]\d*\.[1-9]\d*$/u;

async function run(command, args, cwd) {
  const result = await execFileAsync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.stdout.trim();
}

async function readVersion(repoRoot) {
  const packageJson = JSON.parse(
    await readFile(resolve(repoRoot, "packages/bb-app/package.json"), "utf8"),
  );
  if (
    typeof packageJson !== "object" ||
    packageJson === null ||
    typeof packageJson.version !== "string" ||
    !mpivVersionPattern.test(packageJson.version)
  ) {
    throw new Error("bb-app must have an immutable MPIV prerelease version.");
  }
  return packageJson.version;
}

async function readProtocolVersion(repoRoot) {
  const source = await readFile(
    resolve(repoRoot, "packages/host-daemon-contract/src/protocol.ts"),
    "utf8",
  );
  const match = /HOST_DAEMON_PROTOCOL_VERSION\s*=\s*(\d+)/u.exec(source);
  if (match === null) {
    throw new Error("Unable to read HOST_DAEMON_PROTOCOL_VERSION.");
  }
  return Number(match[1]);
}

function parsePackedFile(stdout) {
  const parsed = JSON.parse(stdout);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 1 ||
    typeof parsed[0] !== "object" ||
    parsed[0] === null ||
    typeof parsed[0].filename !== "string"
  ) {
    throw new Error("npm pack did not return one artifact filename.");
  }
  return parsed[0].filename;
}

export async function prepareMpivArtifact(options) {
  const repoRoot = resolve(options.repoRoot);
  const outputDir = resolve(options.outputDir);
  const upstreamRef = options.upstreamRef;
  const version = await readVersion(repoRoot);
  const protocolVersion = await readProtocolVersion(repoRoot);
  const sourceCommit = await run("git", ["rev-parse", "HEAD"], repoRoot);
  const upstreamBase = await run(
    "git",
    ["merge-base", upstreamRef, sourceCommit],
    repoRoot,
  );
  const customCommitCount = Number(
    await run(
      "git",
      ["rev-list", "--count", `${upstreamBase}..${sourceCommit}`],
      repoRoot,
    ),
  );
  if (!Number.isSafeInteger(customCommitCount) || customCommitCount < 0) {
    throw new Error("Unable to determine the custom commit count.");
  }
  await mkdir(outputDir, { recursive: true });
  const packOutput = await run(
    "npm",
    [
      "pack",
      resolve(repoRoot, "packages/bb-app"),
      "--pack-destination",
      outputDir,
      "--json",
    ],
    repoRoot,
  );
  const artifactPath = resolve(outputDir, parsePackedFile(packOutput));
  const artifactSha256 = createHash("sha256")
    .update(await readFile(artifactPath))
    .digest("hex");
  const manifest = {
    artifact: {
      file: basename(artifactPath),
      sha256: artifactSha256,
    },
    createdAt: options.createdAt,
    customCommitCount,
    distribution: "mpiv",
    protocolVersion,
    schemaVersion: 1,
    sourceBranch: options.sourceBranch,
    sourceCommit,
    upstreamBase,
    version,
  };
  const manifestPath = resolve(outputDir, "mpiv-provenance.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { artifactPath, manifestPath };
}

async function main() {
  const outputArgument = process.argv[2];
  if (!outputArgument) {
    throw new Error(
      "Usage: node scripts/prepare-mpiv-artifact.mjs <output-dir>",
    );
  }
  const result = await prepareMpivArtifact({
    createdAt: new Date().toISOString(),
    outputDir: outputArgument,
    repoRoot: process.env.BB_MPIV_ARTIFACT_REPO_ROOT ?? defaultRepoRoot,
    sourceBranch: process.env.GITHUB_REF_NAME ?? "mpiv/prod",
    upstreamRef: process.env.BB_MPIV_UPSTREAM_REF ?? "origin/main",
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (resolve(process.argv[1] ?? "") === scriptPath) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
