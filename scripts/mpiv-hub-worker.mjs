import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deployMpivHub } from "./mpiv-hub-deploy.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepository = "MPIsaac-Per/bb";
const defaultRoot = "/home/michael/.bb-mpiv/worker";
const defaultWorkflow = "mpiv-build.yml";

function runCommand(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }
      const output = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
      rejectPromise(new Error(`${command} exited ${code}: ${output}`));
    });
  });
}

function parseObject(value, description) {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid ${description}.`);
  }
  return value;
}

function runKey(run) {
  return `${run.id}:${run.run_attempt}`;
}

export function findApprovedBuild(options) {
  for (const candidate of options.runs) {
    const run = parseObject(candidate, "workflow run");
    if (
      run.event !== "push" ||
      run.head_branch !== "mpiv/prod" ||
      (run.conclusion !== null && run.conclusion !== "success") ||
      !Number.isSafeInteger(run.id) ||
      !Number.isSafeInteger(run.run_attempt)
    ) {
      continue;
    }
    if (
      options.lastAttemptedKey === runKey(run) ||
      options.lastAttemptedRunId === run.id
    ) {
      return null;
    }
    const artifacts = options.artifactsByRun.get(run.id) ?? [];
    const buildArtifact = artifacts.find(
      (artifact) =>
        artifact.name === `mpiv-bb-${run.id}-${run.run_attempt}` &&
        artifact.expired === false,
    );
    const approvalArtifact = artifacts.find(
      (artifact) =>
        artifact.name ===
          `mpiv-deploy-approved-${run.id}-${run.run_attempt}` &&
        artifact.expired === false,
    );
    return buildArtifact && approvalArtifact
      ? { approvalArtifact, buildArtifact, run }
      : null;
  }
  return null;
}

export function validateApprovalMarker(options) {
  const manifest = parseObject(options.manifest, "provenance manifest");
  const marker = parseObject(options.marker, "approval marker");
  const run = parseObject(options.run, "workflow run");
  if (
    marker.runId !== run.id ||
    marker.runAttempt !== run.run_attempt ||
    marker.sourceCommit !== run.head_sha ||
    marker.sourceCommit !== manifest.sourceCommit ||
    marker.version !== manifest.version ||
    marker.sha256 !== manifest.artifact?.sha256
  ) {
    throw new Error("Invalid MPIV approval marker.");
  }
}

async function readJson(path, description) {
  try {
    return parseObject(JSON.parse(await readFile(path, "utf8")), description);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid ${description}.`);
    }
    throw error;
  }
}

async function readState(path) {
  try {
    return await readJson(path, "worker state");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeState(path, state) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temporaryPath, path);
}

async function findNamedFile(root, predicate) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findNamedFile(path, predicate);
      if (nested) {
        return nested;
      }
    } else if (predicate(entry.name)) {
      return path;
    }
  }
  return null;
}

async function listRuns(runGh, repository, workflow) {
  const response = JSON.parse(
    await runGh("gh", [
      "api",
      `repos/${repository}/actions/workflows/${workflow}/runs`,
      "--method",
      "GET",
      "-f",
      "branch=mpiv/prod",
      "-f",
      "event=push",
      "-f",
      "per_page=10",
    ]),
  );
  if (!Array.isArray(response.workflow_runs)) {
    throw new Error("Invalid GitHub workflow-runs response.");
  }
  return response.workflow_runs;
}

async function listArtifacts(runGh, repository, runId) {
  const response = JSON.parse(
    await runGh("gh", [
      "api",
      `repos/${repository}/actions/runs/${runId}/artifacts`,
    ]),
  );
  if (!Array.isArray(response.artifacts)) {
    throw new Error("Invalid GitHub artifacts response.");
  }
  return response.artifacts;
}

async function downloadArtifact(runGh, repository, runId, name, directory) {
  await runGh("gh", [
    "run",
    "download",
    String(runId),
    "--repo",
    repository,
    "--name",
    name,
    "--dir",
    directory,
  ]);
}

export async function pollApprovedDeployment(options = {}) {
  const repository = options.repository ?? defaultRepository;
  const root = resolve(options.root ?? defaultRoot);
  const workflow = options.workflow ?? defaultWorkflow;
  const runGh = options.runGh ?? runCommand;
  const deploy = options.deploy ?? deployMpivHub;
  const statePath = join(root, "state.json");
  await mkdir(root, { recursive: true });
  const state = await readState(statePath);
  const runs = await listRuns(runGh, repository, workflow);
  const artifactsByRun = new Map();
  for (const run of runs) {
    if (
      run.event === "push" &&
      run.head_branch === "mpiv/prod" &&
      (run.conclusion === null || run.conclusion === "success")
    ) {
      artifactsByRun.set(
        run.id,
        await listArtifacts(runGh, repository, run.id),
      );
      break;
    }
  }
  const approved = findApprovedBuild({
    artifactsByRun,
    lastAttemptedKey: state.lastAttemptedKey,
    runs,
  });
  if (!approved) {
    return { status: "idle" };
  }
  const key = runKey(approved.run);
  await writeState(statePath, {
    lastAttemptedKey: key,
    runId: approved.run.id,
    status: "deploying",
    updatedAt: new Date().toISOString(),
  });
  const stagingRoot = await mkdtemp(join(tmpdir(), "bb-mpiv-worker-"));
  try {
    const releaseDirectory = join(stagingRoot, "release");
    const approvalDirectory = join(stagingRoot, "approval");
    await Promise.all([
      mkdir(releaseDirectory, { recursive: true }),
      mkdir(approvalDirectory, { recursive: true }),
    ]);
    await downloadArtifact(
      runGh,
      repository,
      approved.run.id,
      approved.buildArtifact.name,
      releaseDirectory,
    );
    await downloadArtifact(
      runGh,
      repository,
      approved.run.id,
      approved.approvalArtifact.name,
      approvalDirectory,
    );
    const artifactPath = await findNamedFile(
      releaseDirectory,
      (name) => name.startsWith("bb-app-") && name.endsWith(".tgz"),
    );
    const manifestPath = await findNamedFile(
      releaseDirectory,
      (name) => name === "mpiv-provenance.json",
    );
    const markerPath = await findNamedFile(
      approvalDirectory,
      (name) => name === "approval.json",
    );
    if (!artifactPath || !manifestPath || !markerPath) {
      throw new Error("Approved MPIV deployment artifacts are incomplete.");
    }
    const manifest = await readJson(manifestPath, "provenance manifest");
    const marker = await readJson(markerPath, "approval marker");
    validateApprovalMarker({ manifest, marker, run: approved.run });
    const result = await deploy({
      artifactPath,
      deploy: true,
      local: true,
      manifestPath,
    });
    await writeState(statePath, {
      lastAttemptedKey: key,
      releaseId: result.releaseId,
      runId: approved.run.id,
      status: "deployed",
      updatedAt: new Date().toISOString(),
      version: result.version,
    });
    return { releaseId: result.releaseId, status: "deployed" };
  } catch (error) {
    await writeState(statePath, {
      error: error instanceof Error ? error.message : String(error),
      lastAttemptedKey: key,
      runId: approved.run.id,
      status: "failed",
      updatedAt: new Date().toISOString(),
    });
    throw error;
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }
}

async function main() {
  const result = await pollApprovedDeployment();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (resolve(process.argv[1] ?? "") === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
