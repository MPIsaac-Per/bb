# MPIV Downstream Operations

The binding product contract is [MPIV Downstream Distribution](specs/mpiv-downstream-distribution.md). This runbook operates the downstream build without changing upstream's npm or signed desktop channels.

## Change Classification

Before implementation, classify the work:

1. A generic BB improvement is built and dogfooded on `mpiv/prod`, then proposed to `get-bb/bb` promptly.
2. Permanent MPIV policy belongs behind one narrow owned seam. Avoid conditional behavior scattered through routes, commands, and UI callers.
3. An optional integration uses a plugin only when the existing plugin interface supports the entire job.

Core database changes carry the highest downstream maintenance cost because Drizzle has one linear migration and snapshot chain. Prefer upstreaming generic schema changes. Never renumber or rewrite a migration that has reached mpiv-hub.

## Branches

- `fork/main` mirrors `get-bb/bb:main` and carries no MPIV product commits.
- `fork/mpiv/prod` names the exact downstream source eligible for production.
- Feature branches start from and merge into `mpiv/prod`.
- `automation/upstream-sync` is disposable integration state maintained by the sync workflow.

The daily `Sync MPIV With Upstream` workflow fast-forwards the fork's `main`, prepares one merge branch, and opens or updates a draft pull request against `mpiv/prod`. It never deploys. Resolve conflicts, run the focused downstream PR gate plus the slice-specific checks named in the pull request, and merge only after review.

The repository must allow GitHub Actions to create pull requests before this workflow can complete. That GitHub setting also permits workflow-authored review approvals, so enabling it is an IRR-4 permissions decision.

## Local Dogfood

Use the isolated source data directory rather than production state:

```bash
scripts/bb-dev-app current --open
eval "$(scripts/bb-dev-app env)"
pnpm bb:dev status --json
```

Use `--desktop` only for Electron main-process behavior. Server and web changes appear through the source browser client and, after Hub deployment, through the normal upstream-signed desktop shell targeting `mpiv.getbb.app`.

## Build

Every pull request into `mpiv/prod` runs one focused `@bb/scripts` typecheck-and-test job. Slice-specific checks are run before the pull request and recorded in its verification section. Every resulting push to `mpiv/prod` runs `Build MPIV Distribution`, which derives a next-patch version such as `0.40.1-mpiv.123456.1`, validates the downstream distribution tooling, smoke-tests the real package, and uploads:

- `bb-app-<version>.tgz`
- `mpiv-provenance.json`

The manifest binds the artifact checksum to the source commit, the merge base fetched directly from `get-bb/bb`, custom commit count, protocol version, and build time. The artifact job cannot deploy. Its dependent deployment job waits for approval in the protected `mpiv-production` environment, publishes an artifact-bound approval marker, and waits for mpiv-hub to report the exact version.

To prepare the same outputs locally with the required distribution gates and package build:

```bash
GITHUB_RUN_ID=<positive-build-id> GITHUB_RUN_ATTEMPT=1 node scripts/prepare-mpiv-version.mjs
pnpm exec turbo run typecheck test --filter=@bb/scripts --concurrency=2 --output-logs=new-only
pnpm exec turbo run smoke:tarball --filter=bb-app --force --output-logs=new-only
node scripts/prepare-mpiv-artifact.mjs .artifacts/mpiv
```

Version preparation modifies both package manifests in the working tree. Use a disposable release worktree or CI checkout; do not commit the generated prerelease version.

## Default Hub Deployment

The default target for every approved `mpiv/prod` build is mpiv-hub. The Hub worker polls GitHub using the Hub's authenticated `gh` CLI, accepts only the newest build with a matching approval marker, and runs the same rollback-first installer locally. It records each attempted run in `/home/michael/.bb-mpiv/worker/state.json` before installation, so a failed release is not retried automatically.

Install or update the worker from a verified `mpiv/prod` checkout:

```bash
ssh hub 'mkdir -p /home/michael/.bb-mpiv/worker /home/michael/.config/systemd/user'
scp scripts/mpiv-hub-deploy.mjs scripts/mpiv-hub-worker.mjs hub:/home/michael/.bb-mpiv/worker/
scp scripts/mpiv-hub/bb-mpiv-deploy-worker.service scripts/mpiv-hub/bb-mpiv-deploy-worker.timer hub:/home/michael/.config/systemd/user/
ssh hub 'systemctl --user daemon-reload && systemctl --user enable --now bb-mpiv-deploy-worker.timer'
```

The workflow's `mpiv-production` environment requires Michael's approval under IRR-5. Approval publishes `mpiv-deploy-approved-<run>-<attempt>`, which binds the run, source commit, version, and checksum. Without that exact marker, the worker does nothing.

Protocol changes update enrolled machines from the Hub's exact `/install/bb-app.tgz`. A disconnected machine updates when it reconnects. A compatible daemon-only change still needs the explicit machine rollout described below.

## Manual Production Plan And Approval

Download the CI artifact into one directory. Validate and display the non-mutating plan:

```bash
node scripts/mpiv-hub-deploy.mjs \
  --artifact .artifacts/mpiv/bb-app-<version>.tgz \
  --manifest .artifacts/mpiv/mpiv-provenance.json
```

Review the exact version, checksum, source commit, upstream base, and migration diff. Production deployment is IRR-5; destructive or contract-phase migration is separately IRR-1. After the human approval, rerun the reviewed command with `--deploy`.

```bash
node scripts/mpiv-hub-deploy.mjs \
  --artifact .artifacts/mpiv/bb-app-<version>.tgz \
  --manifest .artifacts/mpiv/mpiv-provenance.json \
  --deploy
```

The deployment creates `/home/michael/.bb-mpiv/releases/<version>-<checksum>/`, captures the installed package and a consistent SQLite backup, installs the exact artifact, restarts `bb-server.service`, and verifies `/health`, `/install/version`, and `bb status --json`. A failed verification restores the previous package and database before restarting the service.

Read back the primary records after success:

```bash
bb settings version --json
bb machine list --json
ssh hub 'systemctl --user status bb-server.service --no-pager'
```

Then create one real thread on the intended machine. That production completion is the SLICE-4 acceptance event.

## Runtime Alignment

The default deployment target is mpiv-hub. The Hub server and colocated daemon run the installed downstream package, and the server regenerates `/install/bb-app.tgz` from that exact package. Enrolled daemons update automatically only when a newer server-daemon protocol rejects them. Increment `HOST_DAEMON_PROTOCOL_VERSION` for every wire change, never merely to force a release.

A daemon-only implementation change with a compatible wire needs a deliberate package update on each affected enrolled machine. Server and web changes do not require that rollout. A desktop-process change requires a separately named, signed MPIV desktop application and update feed; until one is justified, retain the upstream-signed shell.

## Rollback And Removal

Each release directory contains `bb-app.before.tgz`, `bb.db.before`, the submitted artifact and manifest, and `deployment-result.json`. For a manual rollback, stop the service, reinstall `bb-app.before.tgz`, restore `bb.db.before` only when the release changed data incompatibly, remove the matching WAL and SHM files, start the service, and repeat the primary-record checks.

To retire the downstream distribution, follow the removal section in the binding spec. Keep release directories until their database-backup retention decision is explicit.
