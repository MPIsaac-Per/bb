# MPIV Downstream Distribution

- Status: active
- Delivery tier: T2 Live
- Spec version: 1
  Started: 2026-08-30

Operational runbook: [MPIV Downstream Operations](../mpiv-downstream-operations.md)

## User And Job

Michael uses the MPIV BB fork for daily production work while continuously absorbing fixes and innovations from `get-bb/bb`. He can turn an exact `mpiv/prod` commit into an immutable, inspectable package and prepare a guarded mpiv-hub deployment without publishing under upstream's npm or desktop release channels.

## Operating Model

- `origin/main` is the upstream integration source.
- `fork/main` mirrors upstream and carries no MPIV product commits.
- `fork/mpiv/prod` is the downstream production branch and names the exact source deployed to mpiv-hub.
- Feature branches merge into `mpiv/prod` only after their own acceptance gates pass.
- Generic improvements are dogfooded downstream and proposed upstream promptly.
- Permanent MPIV policy stays behind a narrow owned seam; optional integrations use plugins when the existing plugin interface supports the whole job.
- The upstream signed desktop shell remains the default client for server and web changes. A separate MPIV desktop channel is justified only by desktop-process changes.

## Slice Contract

- Seam: the immutable `bb-app.tgz` plus its provenance manifest.
- Flag: the explicit `--deploy` production argument; omission produces a non-mutating deployment plan.
- Rollback: reinstall the captured previous tarball, restore the pre-deploy SQLite backup when required, restart `bb-server.service`, and verify its reported version.
- Metric: each prepared build records source commit, upstream base, version, protocol version, checksum, creation time, and custom commit count; each production attempt records its verification result in the release directory.

## Acceptance Criteria

1. A repository instruction declares T2 and points future agents to this spec and the canonical delivery standard.
2. One command derives a unique next-patch `mpiv` prerelease and keeps `bb-app` and desktop package versions in lockstep.
3. One command packages the exact downstream build and emits a validated provenance manifest beside it.
4. The build workflow runs from `mpiv/prod`, verifies the relevant Turbo gates, packages the tarball, and uploads the tarball and manifest without publishing to npm.
5. A scheduled and manually runnable workflow reports upstream drift and opens or updates one integration pull request without deploying it.
6. The Hub deployment command is non-mutating by default and requires `--deploy` plus an exact artifact and manifest.
7. A production deployment captures the current package and a consistent SQLite backup before installation, verifies health and version afterward, and automatically restores the captured state when verification fails.
8. The documentation distinguishes server/web, host-daemon, and desktop release behavior and gives the upstream intake, release, rollback, and removal procedures.

## Release And Data Rules

- Building and deploying are separate jobs.
- Production deployment requires human approval under IRR-5.
- Database-destructive or contract-phase migrations require separate human approval under IRR-1.
- A release containing schema changes must use backward-compatible migrations or stop before deployment.
- Any server-daemon wire change increments `HOST_DAEMON_PROTOCOL_VERSION`.
- A daemon-only change that preserves the wire requires an explicit enrolled-machine package rollout; it must not misuse a protocol bump as a release trigger.
- The official desktop application may advance independently while its remote-server contract remains compatible.

## Verification Mapping

1. `AGENTS.md:5` — `records the live delivery tier and durable operating contract`
2. `scripts/prepare-mpiv-version.mjs:23` and `scripts/prepare-mpiv-version.mjs:55` — `derives an immutable next-patch downstream version`, `rejects identifiers that cannot establish release ordering`, and `keeps the server package and desktop shell versions in lockstep`
3. `scripts/prepare-mpiv-artifact.mjs:63` — `packs the downstream package with commit and protocol provenance`
4. `.github/workflows/mpiv-build.yml:3` and `.github/workflows/mpiv-build.yml:46` — `builds mpiv/prod without publishing to npm or deploying`
5. `.github/workflows/mpiv-upstream-sync.yml:3` and `.github/workflows/mpiv-upstream-sync.yml:39` — `prepares one non-deploying upstream integration pull request`
6. `scripts/mpiv-hub-deploy.mjs:135` and `scripts/mpiv-hub-deploy.mjs:149` — `is non-mutating until the operator passes --deploy`
7. `scripts/mpiv-hub-deploy.mjs:23` and `scripts/mpiv-hub-deploy.mjs:31` — `uploads one verified release and sends the rollback-first installer`
8. `docs/mpiv-downstream-operations.md:5`, `docs/mpiv-downstream-operations.md:36`, `docs/mpiv-downstream-operations.md:56`, `docs/mpiv-downstream-operations.md:87`, and `docs/mpiv-downstream-operations.md:93` — `records the live delivery tier and durable operating contract`

## Removal

Delete the MPIV build and drift workflows, the MPIV packaging and deployment commands, their tests, and this spec. Reinstall the current upstream `bb-app` package on mpiv-hub, restart `bb-server.service`, verify the upstream version and machine connectivity, and move normal development back to the mirrored `main` branch. Preserve release directories until their database backups expire under the operator's retention decision.
