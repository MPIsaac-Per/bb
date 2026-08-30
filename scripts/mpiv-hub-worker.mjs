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
const defaultBbCli = "/home/michael/.npm-global/bin/bb";
const defaultBbServerUrl = "http://127.0.0.1:38886";

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
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
    typeof marker.version !== "string" ||
    typeof marker.sha256 !== "string" ||
    typeof manifest.version !== "string" ||
    typeof manifest.artifact?.sha256 !== "string" ||
    marker.runId !== run.id ||
    marker.runAttempt !== run.run_attempt ||
    marker.sourceCommit !== run.head_sha ||
    marker.sourceCommit !== manifest.sourceCommit ||
    marker.version !== manifest.version ||
    marker.sha256 !== manifest.artifact.sha256
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseMachineList(output) {
  let value;
  try {
    value = JSON.parse(output);
  } catch {
    throw new Error("Invalid machine list response.");
  }
  if (!Array.isArray(value)) {
    throw new Error("Invalid machine list response.");
  }
  return value.map((candidate) => {
    const machine = parseObject(candidate, "machine list response");
    if (typeof machine.id !== "string" || typeof machine.status !== "string") {
      throw new Error("Invalid machine list response.");
    }
    return machine;
  });
}

function parseInstallReleaseResult(output, expectedVersion) {
  let value;
  try {
    value = parseObject(JSON.parse(output), "install-release response");
  } catch {
    throw new Error("Invalid install-release response.");
  }
  if (
    (value.outcome !== "installed" && value.outcome !== "already-current") ||
    value.version !== expectedVersion
  ) {
    throw new Error("Invalid install-release response.");
  }
  return value;
}

function runBbCli(runBb, bbCli, bbServerUrl, args) {
  return runBb(bbCli, args, {
    env: {
      ...process.env,
      BB_SERVER_URL: bbServerUrl,
    },
  });
}

function hasPendingRollout(state) {
  return (
    typeof state.rolloutVersion === "string" &&
    (state.rolloutEnrollmentPending === true ||
      (Array.isArray(state.pendingMachineIds) &&
        state.pendingMachineIds.length > 0))
  );
}

export async function processMachineRollout(options) {
  const state = parseObject(options.state, "worker state");
  const rolloutVersion = state.rolloutVersion;
  const pendingMachineIds = state.pendingMachineIds;
  if (
    typeof rolloutVersion !== "string" ||
    !Array.isArray(pendingMachineIds) ||
    pendingMachineIds.some((id) => typeof id !== "string")
  ) {
    throw new Error("Invalid machine rollout state.");
  }
  if (
    state.rolloutEnrollmentPending !== true &&
    pendingMachineIds.length === 0
  ) {
    return state;
  }
  const runBb = options.runBb ?? runCommand;
  const bbCli = options.bbCli ?? process.env.BB_CLI ?? defaultBbCli;
  const bbServerUrl =
    options.bbServerUrl ?? process.env.BB_SERVER_URL ?? defaultBbServerUrl;
  let machines;
  try {
    machines = parseMachineList(
      await runBbCli(runBb, bbCli, bbServerUrl, [
        "machine",
        "list",
        "--json",
      ]),
    );
  } catch (error) {
    return {
      ...state,
      rolloutError: errorMessage(error),
      rolloutStatus: "pending",
      status: "rollout-pending",
      updatedAt: new Date().toISOString(),
    };
  }
  const machinesById = new Map(machines.map((machine) => [machine.id, machine]));
  const enrolledIds = [...machinesById.keys()];
  let pending =
    state.rolloutEnrollmentPending === true
      ? enrolledIds
      : pendingMachineIds.filter((id) => machinesById.has(id));
  const previousFailures = parseObject(
    state.rolloutFailures ?? {},
    "machine rollout failures",
  );
  const rolloutFailures = Object.fromEntries(
    Object.entries(previousFailures).filter(([id]) => pending.includes(id)),
  );
  for (const machineId of pending) {
    if (machinesById.get(machineId)?.status !== "connected") {
      continue;
    }
    try {
      const output = await runBbCli(runBb, bbCli, bbServerUrl, [
        "machine",
        "install-release",
        machineId,
        "--version",
        rolloutVersion,
        "--json",
      ]);
      parseInstallReleaseResult(output, rolloutVersion);
      pending = pending.filter((id) => id !== machineId);
      delete rolloutFailures[machineId];
    } catch (error) {
      rolloutFailures[machineId] = errorMessage(error);
    }
  }
  const rolloutStatus = pending.length === 0 ? "complete" : "pending";
  return {
    ...state,
    pendingMachineIds: pending,
    rolloutEnrollmentPending: false,
    rolloutError: null,
    rolloutFailures,
    rolloutStatus,
    status: `rollout-${rolloutStatus}`,
    updatedAt: new Date().toISOString(),
  };
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
  const runBb = options.runBb ?? runCommand;
  const deploy = options.deploy ?? deployMpivHub;
  const bbCli = options.bbCli ?? process.env.BB_CLI ?? defaultBbCli;
  const bbServerUrl =
    options.bbServerUrl ?? process.env.BB_SERVER_URL ?? defaultBbServerUrl;
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
    if (!hasPendingRollout(state)) {
      return { status: "idle" };
    }
    const rolloutState = await processMachineRollout({
      bbCli,
      bbServerUrl,
      runBb,
      state,
    });
    await writeState(statePath, rolloutState);
    return {
      pendingMachineIds: rolloutState.pendingMachineIds,
      rolloutVersion: rolloutState.rolloutVersion,
      status: rolloutState.status,
    };
  }
  const key = runKey(approved.run);
  await writeState(statePath, {
    ...state,
    deploymentStatus: "deploying",
    lastAttemptedKey: key,
    runId: approved.run.id,
    status: "deploying",
    updatedAt: new Date().toISOString(),
  });
  const stagingRoot = await mkdtemp(join(tmpdir(), "bb-mpiv-worker-"));
  let result;
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
    await writeState(statePath, {
      ...state,
      deploymentStatus: "deploying",
      lastAttemptedKey: key,
      pendingMachineIds: [],
      rolloutEnrollmentPending: true,
      rolloutFailures: {},
      rolloutStatus: "pending",
      rolloutVersion: manifest.version,
      runId: approved.run.id,
      status: "deploying",
      updatedAt: new Date().toISOString(),
    });
    result = await deploy({
      artifactPath,
      deploy: true,
      local: true,
      manifestPath,
    });
  } catch (error) {
    await writeState(statePath, {
      ...state,
      deploymentStatus: "failed",
      error: errorMessage(error),
      lastAttemptedKey: key,
      runId: approved.run.id,
      status: hasPendingRollout(state) ? "rollout-pending" : "deployment-failed",
      updatedAt: new Date().toISOString(),
    });
    throw error;
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }
  const deployedState = {
    deploymentStatus: "deployed",
    lastAttemptedKey: key,
    pendingMachineIds: [],
    releaseId: result.releaseId,
    rolloutEnrollmentPending: true,
    rolloutFailures: {},
    rolloutStatus: "pending",
    rolloutVersion: result.version,
    runId: approved.run.id,
    status: "rollout-pending",
    updatedAt: new Date().toISOString(),
    version: result.version,
  };
  await writeState(statePath, deployedState);
  const rolloutState = await processMachineRollout({
    bbCli,
    bbServerUrl,
    runBb,
    state: deployedState,
  });
  await writeState(statePath, rolloutState);
  return {
    pendingMachineIds: rolloutState.pendingMachineIds,
    releaseId: result.releaseId,
    rolloutVersion: rolloutState.rolloutVersion,
    status: rolloutState.status,
  };
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
