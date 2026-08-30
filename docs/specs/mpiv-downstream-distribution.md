# MPIV Downstream Distribution

- Status: active
- Delivery tier: T2 Live
- Spec version: 2
- Started: 2026-08-30

Operational runbook: [MPIV Downstream Operations](../mpiv-downstream-operations.md)

## User And Job

Michael uses the MPIV BB fork for daily production work while continuously absorbing fixes and innovations from `get-bb/bb`. An exact `mpiv/prod` commit becomes an immutable, inspectable package; after explicit production approval, that package deploys to mpiv-hub and the exact installed release rolls out durably to every enrolled machine without publishing under upstream's npm or desktop release channels.

## Operating Model

- `origin/main` is the upstream integration source.
- `fork/main` mirrors upstream and carries no MPIV product commits.
- `fork/mpiv/prod` is the downstream production branch and names the exact source deployed to mpiv-hub.
- Feature branches merge into `mpiv/prod` only after their own acceptance gates pass.
- Every successful `mpiv/prod` build flows to the protected `mpiv-production` approval gate; the default approved target is mpiv-hub.
- Every approved Hub deployment starts or supersedes a persisted exact-version rollout to all currently enrolled machines.
- Generic improvements are dogfooded downstream and proposed upstream promptly.
- Permanent MPIV policy stays behind a narrow owned seam; optional integrations use plugins when the existing plugin interface supports the whole job.
- The upstream signed desktop shell remains the default client for server and web changes. A separate MPIV desktop channel is justified only by desktop-process changes.

## Slice Contract

- Seam: the immutable `bb-app.tgz`, its provenance manifest, the artifact-bound deployment approval marker, and the Hub worker's exact-version machine-rollout state.
- Flag: the explicit `--deploy` production argument for manual recovery; omission produces a non-mutating deployment plan.
- Approval gate: the protected `mpiv-production` environment creates a marker only after human approval under IRR-5.
- Rollback: reinstall the captured previous tarball, restore the pre-deploy SQLite backup when required, restart `bb-server.service`, and verify its reported version.
- Metric: each prepared build records source commit, upstream base, version, protocol version, checksum, creation time, and custom commit count; each production attempt records its verification result, `deploymentStatus`, `rolloutStatus`, `rolloutVersion`, and pending machine IDs in the release directory or Hub worker state.

## Acceptance Criteria

1. A repository instruction declares T2 and points future agents to this spec and the canonical delivery standard.
2. One command derives a unique next-patch `mpiv` prerelease and keeps `bb-app` and desktop package versions in lockstep.
3. One command packages the exact downstream build and emits a validated provenance manifest beside it.
4. The build workflow runs one focused `@bb/scripts` typecheck-and-test job on pull requests into `mpiv/prod`; after merge it packages the tarball and uploads the tarball and manifest without publishing to npm.
5. A dependent job waits for `mpiv-production` approval, publishes an artifact-bound marker, and reports failure unless mpiv-hub serves the exact approved version.
6. The Hub worker accepts only the newest build with a matching approval marker, deploys it through the canonical rollback-first installer, persists an exact-version rollout to all enrolled machines, and retries pending machines on later timer invocations without changing the successful Hub deployment.
7. A scheduled and manually runnable workflow reports upstream drift and opens or updates one integration pull request without deploying it.
8. The Hub deployment command is non-mutating by default and requires `--deploy` plus an exact artifact and manifest.
9. A production deployment captures the current package and a consistent SQLite backup before installation, verifies health and version afterward, and automatically restores the captured state when verification fails.
10. The documentation distinguishes server/web, host-daemon, and desktop release behavior and gives the upstream intake, release, durable rollout, failure, rollback, and removal procedures.

## Release And Data Rules

- Building and deploying are separate jobs joined by the protected production environment.
- Production deployment requires human approval under IRR-5.
- The default approved deployment target is mpiv-hub.
- Database-destructive or contract-phase migrations require separate human approval under IRR-1.
- A release containing schema changes must use backward-compatible migrations or stop before deployment.
- Every approved Hub deployment explicitly rolls its exact `/install` release out to all enrolled machines, regardless of protocol compatibility.
- Any server-daemon wire change increments `HOST_DAEMON_PROTOCOL_VERSION`; the existing protocol-mismatch update behavior remains intact.
- Pending machines leave rollout state only when deleted or after an exact-version `installed` or `already-current` response. Disconnected and transiently failing machines remain pending for a later timer invocation.
- The official desktop application may advance independently while its remote-server contract remains compatible.

## Verification Mapping

1. `AGENTS.md:5` — `records the live delivery tier and durable operating contract`
2. `scripts/prepare-mpiv-version.mjs:23` and `scripts/prepare-mpiv-version.mjs:55` — `derives an immutable next-patch downstream version`, `rejects identifiers that cannot establish release ordering`, and `keeps the server package and desktop shell versions in lockstep`
3. `scripts/prepare-mpiv-artifact.mjs:63` — `packs the downstream package with commit and protocol provenance`
4. `.github/workflows/mpiv-build.yml:7`, `.github/workflows/mpiv-build.yml:20`, and `.github/workflows/mpiv-build.yml:40` — `runs the focused downstream pull-request gate and builds mpiv/prod without publishing to npm`
5. `.github/workflows/mpiv-build.yml:100` and `.github/workflows/mpiv-build.yml:107` — `waits for protected production approval, publishes the artifact-bound marker, and verifies the served Hub version`
6. `scripts/mpiv-hub-worker.mjs:200`, `scripts/mpiv-hub-worker.mjs:348`, `packages/scripts/test/mpiv-hub-worker.test.mjs:140`, and `scripts/mpiv-hub/bb-mpiv-deploy-worker.timer:4` — `deploys only the newest approved build, persists its machine rollout, retains disconnected or failed machines, and retries pending work without a new artifact`
7. `.github/workflows/mpiv-upstream-sync.yml:3` and `.github/workflows/mpiv-upstream-sync.yml:30` — `prepares one non-deploying upstream integration pull request`
8. `scripts/mpiv-hub-deploy.mjs:136` and `scripts/mpiv-hub-deploy.mjs:153` — `is non-mutating until the operator passes --deploy`
9. `scripts/mpiv-hub-deploy.mjs:23` and `scripts/mpiv-hub-deploy.mjs:31` — `captures rollback state and restores it after failed verification`
10. `docs/mpiv-downstream-operations.md:38`, `docs/mpiv-downstream-operations.md:58`, `docs/mpiv-downstream-operations.md:75`, and `docs/mpiv-downstream-operations.md:106` — `documents build, default deployment, manual recovery, runtime alignment, and removal`

## Removal

Disable and remove `bb-mpiv-deploy-worker.timer` and `bb-mpiv-deploy-worker.service`, then delete the MPIV build and drift workflows, packaging and deployment commands, their tests, and this spec. Reinstall the current upstream `bb-app` package on mpiv-hub, restart `bb-server.service`, verify the upstream version and machine connectivity, and move normal development back to the mirrored `main` branch. Preserve release directories until their database backups expire under the operator's retention decision.
