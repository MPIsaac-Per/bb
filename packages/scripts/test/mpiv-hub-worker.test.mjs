import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findApprovedBuild,
  pollApprovedDeployment,
  validateApprovalMarker,
} from "../../../scripts/mpiv-hub-worker.mjs";

const run = {
  conclusion: null,
  event: "push",
  head_branch: "mpiv/prod",
  head_sha: "1234567890abcdef1234567890abcdef12345678",
  id: 42,
  run_attempt: 1,
  status: "in_progress",
};

const buildArtifact = {
  expired: false,
  id: 100,
  name: "mpiv-bb-42-1",
};

const approvalArtifact = {
  expired: false,
  id: 101,
  name: "mpiv-deploy-approved-42-1",
};

const testRoots = [];

async function createWorkerRoot(state) {
  const root = await mkdtemp(join(tmpdir(), "bb-mpiv-worker-test-"));
  testRoots.push(root);
  await writeFile(
    join(root, "state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
  );
  return root;
}

async function readWorkerState(root) {
  return JSON.parse(await readFile(join(root, "state.json"), "utf8"));
}

function noApprovedBuild() {
  return JSON.stringify({ workflow_runs: [] });
}

afterEach(async () => {
  await Promise.all(
    testRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("MPIV Hub deployment worker", () => {
  it("selects the newest approved, unattempted production build", () => {
    expect(
      findApprovedBuild({
        artifactsByRun: new Map([
          [42, [buildArtifact, approvalArtifact]],
        ]),
        lastAttemptedRunId: null,
        runs: [run],
      }),
    ).toEqual({
      approvalArtifact,
      buildArtifact,
      run,
    });
    expect(
      findApprovedBuild({
        artifactsByRun: new Map([
          [42, [buildArtifact, approvalArtifact]],
        ]),
        lastAttemptedRunId: 42,
        runs: [run],
      }),
    ).toBeNull();
  });

  it("never falls back to an older approved build", () => {
    const newerRun = {
      ...run,
      head_sha: "abcdef1234567890abcdef1234567890abcdef12",
      id: 43,
    };
    const newerBuildArtifact = {
      ...buildArtifact,
      id: 102,
      name: "mpiv-bb-43-1",
    };

    expect(
      findApprovedBuild({
        artifactsByRun: new Map([
          [43, [newerBuildArtifact]],
          [42, [buildArtifact, approvalArtifact]],
        ]),
        lastAttemptedRunId: null,
        runs: [newerRun, run],
      }),
    ).toBeNull();
  });

  it("binds approval to the exact run, commit, version, and checksum", () => {
    const manifest = {
      artifact: {
        sha256: "a".repeat(64),
      },
      sourceCommit: run.head_sha,
      version: "0.40.1-mpiv.42.1",
    };
    const marker = {
      runAttempt: 1,
      runId: 42,
      sha256: "a".repeat(64),
      sourceCommit: run.head_sha,
      version: "0.40.1-mpiv.42.1",
    };

    expect(() => validateApprovalMarker({ manifest, marker, run })).not.toThrow();
    expect(() =>
      validateApprovalMarker({
        manifest,
        marker: { ...marker, sha256: "b".repeat(64) },
        run,
      }),
    ).toThrow("approval marker");
  });

  it("persists machines until install-release returns typed success", async () => {
    const rolloutVersion = "0.40.1-mpiv.42.1";
    const root = await createWorkerRoot({
      pendingMachineIds: ["machine-a", "machine-b", "machine-deleted"],
      rolloutEnrollmentPending: false,
      rolloutStatus: "pending",
      rolloutVersion,
      status: "rollout-pending",
    });
    const runGh = vi.fn(async () => noApprovedBuild());
    const runBb = vi.fn(async (command, args, options) => {
      expect(command).toBe("/home/michael/.npm-global/bin/bb");
      expect(options.env.BB_SERVER_URL).toBe("http://127.0.0.1:38886");
      if (args[1] === "list") {
        return JSON.stringify([
          { id: "machine-a", status: "connected" },
          { id: "machine-b", status: "connected" },
        ]);
      }
      if (args[2] === "machine-b") {
        throw new Error("temporary transport failure");
      }
      return JSON.stringify({
        outcome: "installed",
        version: "0.40.1-mpiv.wrong",
      });
    });

    const result = await pollApprovedDeployment({
      bbCli: "/home/michael/.npm-global/bin/bb",
      bbServerUrl: "http://127.0.0.1:38886",
      root,
      runBb,
      runGh,
    });
    const state = await readWorkerState(root);

    expect(result.status).toBe("rollout-pending");
    expect(state.pendingMachineIds).toEqual(["machine-a", "machine-b"]);
    expect(state.rolloutFailures["machine-a"]).toContain(
      "Invalid install-release response",
    );
    expect(state.rolloutFailures["machine-b"]).toContain(
      "temporary transport failure",
    );
    expect(runBb.mock.calls[1][1]).toEqual([
      "machine",
      "install-release",
      "machine-a",
      "--version",
      rolloutVersion,
      "--json",
    ]);
  });

  it("retains a disconnected machine and completes it on a later invocation", async () => {
    const rolloutVersion = "0.40.1-mpiv.42.1";
    const root = await createWorkerRoot({
      pendingMachineIds: ["machine-a"],
      rolloutEnrollmentPending: false,
      rolloutStatus: "pending",
      rolloutVersion,
      status: "rollout-pending",
    });
    const runGh = vi.fn(async () => noApprovedBuild());
    let listCount = 0;
    const runBb = vi.fn(async (_command, args) => {
      if (args[1] === "list") {
        listCount += 1;
        return JSON.stringify([
          {
            id: "machine-a",
            status: listCount === 1 ? "disconnected" : "connected",
          },
        ]);
      }
      return JSON.stringify({ outcome: "installed", version: rolloutVersion });
    });

    await pollApprovedDeployment({ root, runBb, runGh });
    expect((await readWorkerState(root)).pendingMachineIds).toEqual([
      "machine-a",
    ]);

    const result = await pollApprovedDeployment({ root, runBb, runGh });
    const state = await readWorkerState(root);

    expect(result.status).toBe("rollout-complete");
    expect(state.pendingMachineIds).toEqual([]);
    expect(state.rolloutStatus).toBe("complete");
  });

  it("completes already-current machines idempotently", async () => {
    const rolloutVersion = "0.40.1-mpiv.42.1";
    const root = await createWorkerRoot({
      pendingMachineIds: ["machine-a"],
      rolloutEnrollmentPending: false,
      rolloutStatus: "pending",
      rolloutVersion,
      status: "rollout-pending",
    });
    const runGh = vi.fn(async () => noApprovedBuild());
    const runBb = vi.fn(async (_command, args) => {
      if (args[1] === "list") {
        return JSON.stringify([
          { id: "machine-a", status: "connected" },
        ]);
      }
      return JSON.stringify({
        outcome: "already-current",
        version: rolloutVersion,
      });
    });

    await pollApprovedDeployment({ root, runBb, runGh });
    await pollApprovedDeployment({ root, runBb, runGh });
    const state = await readWorkerState(root);

    expect(state.status).toBe("rollout-complete");
    expect(state.pendingMachineIds).toEqual([]);
    expect(runBb).toHaveBeenCalledTimes(2);
  });

  it("supersedes an older pending rollout and retries the new release", async () => {
    const rolloutVersion = "0.40.2-mpiv.43.1";
    const sourceCommit = "abcdef1234567890abcdef1234567890abcdef12";
    const sha256 = "b".repeat(64);
    const approvedRun = {
      ...run,
      conclusion: "success",
      head_sha: sourceCommit,
      id: 43,
      status: "completed",
    };
    const approvedBuildArtifact = {
      expired: false,
      id: 102,
      name: "mpiv-bb-43-1",
    };
    const approvedMarkerArtifact = {
      expired: false,
      id: 103,
      name: "mpiv-deploy-approved-43-1",
    };
    const root = await createWorkerRoot({
      pendingMachineIds: ["removed-old"],
      rolloutEnrollmentPending: false,
      rolloutStatus: "pending",
      rolloutVersion: "0.40.1-mpiv.42.1",
      status: "rollout-pending",
    });
    const runGh = vi.fn(async (_command, args) => {
      if (args[0] === "api" && args[1].includes("/workflows/")) {
        return JSON.stringify({ workflow_runs: [approvedRun] });
      }
      if (args[0] === "api") {
        return JSON.stringify({
          artifacts: [approvedBuildArtifact, approvedMarkerArtifact],
        });
      }
      const name = args[args.indexOf("--name") + 1];
      const directory = args[args.indexOf("--dir") + 1];
      if (name === approvedBuildArtifact.name) {
        await writeFile(join(directory, `bb-app-${rolloutVersion}.tgz`), "data");
        await writeFile(
          join(directory, "mpiv-provenance.json"),
          JSON.stringify({
            artifact: { sha256 },
            sourceCommit,
            version: rolloutVersion,
          }),
        );
      } else {
        await writeFile(
          join(directory, "approval.json"),
          JSON.stringify({
            runAttempt: 1,
            runId: 43,
            sha256,
            sourceCommit,
            version: rolloutVersion,
          }),
        );
      }
      return "";
    });
    const deploy = vi.fn(async () => {
      const deployingState = await readWorkerState(root);
      expect(deployingState).toMatchObject({
        deploymentStatus: "deploying",
        pendingMachineIds: [],
        rolloutEnrollmentPending: true,
        rolloutVersion,
      });
      return {
        releaseId: `${rolloutVersion}-${sha256}`,
        version: rolloutVersion,
      };
    });
    let listCount = 0;
    const runBb = vi.fn(async (_command, args) => {
      if (args[1] === "list") {
        listCount += 1;
        return JSON.stringify([
          {
            id: "current-offline",
            status: listCount === 1 ? "disconnected" : "connected",
          },
          { id: "current-online", status: "connected" },
        ]);
      }
      return JSON.stringify({
        outcome: "installed",
        version: rolloutVersion,
      });
    });

    const deployed = await pollApprovedDeployment({
      deploy,
      root,
      runBb,
      runGh,
    });
    const pendingState = await readWorkerState(root);

    expect(deployed.status).toBe("rollout-pending");
    expect(pendingState.rolloutVersion).toBe(rolloutVersion);
    expect(pendingState.pendingMachineIds).toEqual(["current-offline"]);
    expect(pendingState.pendingMachineIds).not.toContain("removed-old");
    expect(runBb.mock.calls[1][1]).toContain("current-online");

    const completed = await pollApprovedDeployment({
      deploy,
      root,
      runBb,
      runGh,
    });
    const completeState = await readWorkerState(root);

    expect(completed.status).toBe("rollout-complete");
    expect(completeState.pendingMachineIds).toEqual([]);
    expect(runBb.mock.calls[3][1]).toContain("current-offline");
    expect(deploy).toHaveBeenCalledTimes(1);
  });
});
