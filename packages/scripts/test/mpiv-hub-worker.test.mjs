import { describe, expect, it } from "vitest";
import {
  findApprovedBuild,
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
});
