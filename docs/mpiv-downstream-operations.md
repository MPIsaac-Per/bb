# MPIV Downstream Operations

The binding product contract is [MPIV Downstream Distribution](specs/mpiv-downstream-distribution.md). This runbook operates the downstream build without changing upstream's npm or signed desktop channels.

## Change Classification

Before implementation, classify the work:

1. A generic BB improvement is built and dogfooded on `mpiv/prod`, then proposed to `get-bb/bb` promptly.
2. Permanent MPIV policy belongs behind one narrow owned seam. Avoid conditional behavior scattered through routes, commands, and UI callers.
3. An optional integration uses a plugin only when the existing plugin interface supports the entire job.

Core database changes carry the highest downstream maintenance cost because Drizzle has one linear migration and snapshot chain. Prefer upstreaming generic schema changes. Never renumber or rewrite a migration that has reached mpiv-hub.

## Upstream Contributions

Keep the upstream candidate free of MPIV-only history while dogfooding the same generic change in production.

1. Classify the change before implementation. Generic product behavior is an upstream candidate. MPIV distribution, deployment, and policy remain downstream.
2. For a feature request or UI change, open an issue against `get-bb/bb` and wait for maintainer sign-off. For a bug fix, capture the verified reproduction and evidence required by `CONTRIBUTING.md` and `docs/filing-issues.md`.
3. Build the generic commit series from current upstream:

```bash
git fetch origin main
git switch -c upstream/<slug> origin/main
```

Implement and verify only the generic change, then commit it and push the candidate:

```bash
git push -u fork upstream/<slug>
```

4. Dogfood the exact generic commits through the downstream release path:

```bash
git switch -c mpiv/<slug> fork/mpiv/prod
git cherry-pick <generic-commit>
git push -u fork mpiv/<slug>
gh pr create --repo MPIsaac-Per/bb --base mpiv/prod --head mpiv/<slug>
```

After the downstream pull request passes its slice-specific checks, merge it and approve its exact production artifact under IRR-5. Confirm the behavior on mpiv-hub and representative enrolled machines.

5. After successful dogfood and any required upstream issue sign-off, open the clean upstream pull request:

```bash
gh pr create \
  --repo get-bb/bb \
  --base main \
  --head MPIsaac-Per:upstream/<slug>
```

Use the current upstream pull-request template, include the upstream issue link when required, report verification performed against the clean branch, and append `> AGENT GENERATED`. Never merge `mpiv/prod` into the candidate or include `.github/workflows/mpiv-*`, `scripts/mpiv-*`, `docs/mpiv-*`, or other MPIV-only policy.

If the improvement already landed downstream, create `upstream/<slug>` from current `origin/main` and cherry-pick or reconstruct only the generic commits. Resolve dependencies on the clean branch rather than importing downstream history. After upstream merges, consume it through the normal upstream-sync pull request; do not rewrite `mpiv/prod` history.

## Branches

- `fork/main` mirrors `get-bb/bb:main` and carries no MPIV product commits.
- `fork/mpiv/prod` names the exact downstream source eligible for production.
- MPIV-only and downstream dogfood branches start from `mpiv/prod`; clean upstream candidates start from `origin/main`.
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

The default target for every approved `mpiv/prod` build is mpiv-hub. The Hub worker polls GitHub using the Hub's authenticated `gh` CLI, accepts only the newest build with a matching approval marker, and runs the same rollback-first installer locally. It records each attempted run in `/home/michael/.bb-mpiv/worker/state.json` before installation, so a failed Hub release is not retried automatically.

Install or update the worker from a verified `mpiv/prod` checkout:

```bash
ssh hub 'mkdir -p /home/michael/.bb-mpiv/worker /home/michael/.config/systemd/user'
scp scripts/mpiv-hub-deploy.mjs scripts/mpiv-hub-worker.mjs hub:/home/michael/.bb-mpiv/worker/
scp scripts/mpiv-hub/bb-mpiv-deploy-worker.service scripts/mpiv-hub/bb-mpiv-deploy-worker.timer hub:/home/michael/.config/systemd/user/
ssh hub 'systemctl --user daemon-reload && systemctl --user enable --now bb-mpiv-deploy-worker.timer'
```

The worker defaults to `BB_CLI=/home/michael/.npm-global/bin/bb` and `BB_SERVER_URL=http://127.0.0.1:38886`, ensuring rollout commands use the CLI installed by the exact local Hub deployment against the loopback server. Override either value with a systemd user-unit drop-in only when the Hub installation changes. The service does not export `BB_CLI`, so deployment health checks cannot recursively re-execute the installed CLI.

The workflow's `mpiv-production` environment requires Michael's approval under IRR-5. Approval publishes `mpiv-deploy-approved-<run>-<attempt>`, which binds the run, source commit, version, and checksum. Without that exact marker, the worker does not deploy a new build, but it still processes an existing machine rollout.

After the Hub deployment succeeds, the worker lists every enrolled machine, writes `rolloutVersion` and `pendingMachineIds`, and calls `bb machine install-release <id> --version <rolloutVersion> --json` for each connected pending machine. State is `rollout-pending` until every enrolled machine is deleted or returns `{ "outcome": "installed" | "already-current", "version": "<rolloutVersion>" }`; it then becomes `rollout-complete`. A newer approved deployment replaces any older pending rollout with the new version and the current enrolled-machine IDs.

Every timer invocation retries pending work even when no new artifact exists. Deleted machines leave the pending set. Disconnected machines remain pending and install on the first timer invocation after they reconnect. A machine-list failure preserves the whole set; a connected machine's command failure or invalid response preserves that machine. Machines configured without daemon auto-update remain pending until auto-update is restored or the machine is deleted. `rolloutError` and `rolloutFailures` record the latest failures in state. These failures do not roll back or mark the successful Hub deployment as failed.

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

The default deployment target is mpiv-hub. The Hub server and colocated daemon run the installed downstream package, and the server regenerates `/install/bb-app.tgz` from that exact package. After every approved Hub deployment, the worker explicitly rolls that exact release out to every enrolled machine, including releases whose server-daemon protocol is unchanged. Protocol-incompatible daemons retain their existing mismatch-triggered update behavior.

Server and web changes therefore reach enrolled machines as part of the same durable rollout even when their daemon code is unchanged. A desktop-process change still requires a separately named, signed MPIV desktop application and update feed; until one is justified, retain the upstream-signed shell.

## Rollback And Removal

Each release directory contains `bb-app.before.tgz`, `bb.db.before`, the submitted artifact and manifest, and `deployment-result.json`. For a manual rollback, stop the service, reinstall `bb-app.before.tgz`, restore `bb.db.before` only when the release changed data incompatibly, remove the matching WAL and SHM files, start the service, and repeat the primary-record checks.

To retire the downstream distribution, follow the removal section in the binding spec. Keep release directories until their database-backup retention decision is explicit.
